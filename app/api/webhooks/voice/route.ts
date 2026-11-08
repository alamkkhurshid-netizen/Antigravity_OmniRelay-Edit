import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAndDeduct } from "@/lib/billing/deduction-engine";

export const dynamic = "force-dynamic";

const voiceWebhookReplayCache = new Map<string, number>();

function verifySignature(rawBody: string, signature: string | null, timestampStr: string | null, eventId: string | null): boolean {
  if (!signature || !timestampStr) return false;

  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Voice Webhook] VOICE_WEBHOOK_SECRET is not configured. Rejecting request.");
    return false;
  }

  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);
  // Replay protection: within 300 seconds
  if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) return false;

  const dedupKey = eventId || signature;
  for (const [k, ts] of voiceWebhookReplayCache.entries()) {
    if (now - ts > 600) voiceWebhookReplayCache.delete(k);
  }
  if (voiceWebhookReplayCache.has(dedupKey)) {
    console.warn("[Voice Webhook] Replay attack detected for key:", dedupKey);
    return false;
  }
  voiceWebhookReplayCache.set(dedupKey, now);

  const toSign = `${timestamp}.${rawBody}`;
  const expectedSig = "v1=" + crypto.createHmac("sha256", secret).update(toSign).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  return true;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-omnirelay-signature");
    const timestamp = req.headers.get("x-omnirelay-timestamp");
    const eventName = req.headers.get("x-omnirelay-event");

    const eventId = req.headers.get("x-omnirelay-event-id") || req.headers.get("x-omnirelay-request-id");

    // 1. Cryptographic Authentication
    if (!verifySignature(rawBody, signature, timestamp, eventId)) {
      return NextResponse.json({ error: "Invalid webhook signature or expired timestamp" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const event = eventName || payload?.event;
    const data = payload?.data || payload;
    const orgId = payload?.org_id || data?.org_id || data?.organization_id;

    const supabaseAdmin = createAdminClient();

    console.log(`[Voice Webhook] Received authenticated event: '${event}' for org '${orgId}'`);

    switch (event) {
      case "emergency.escalated": {
        // High-priority clinical emergency intervention
        if (orgId) {
          await supabaseAdmin.from("app_notifications").insert({
            organization_id: orgId,
            notification_type: "serious_action",
            priority: "critical",
            title: `CRITICAL: Voice 108 Emergency Intervention (${data?.caller_phone || "Caller"})`,
            body: `Emergency escalated by Voice AI: ${data?.reason || "Severe clinical distress"}. Immediate attention required.`,
            href: "/app/agents",
            entity_type: "voice_call_emergency",
            entity_id: data?.call_sid || null,
            escalation_level: 3,
          });
        }
        break;
      }

      case "call.transferred": {
        // Transfer to human receptionist
        if (orgId) {
          const isTransferFailed = data?.status === "failed" || data?.transfer_failed === true;

          await supabaseAdmin.from("app_notifications").insert({
            organization_id: orgId,
            notification_type: isTransferFailed ? "serious_action" : "task_assigned",
            priority: isTransferFailed ? "high" : "normal",
            title: isTransferFailed
              ? `Transfer Failed: Call from ${data?.caller_phone || "Patient"}`
              : `Call Transferred to Front Desk (${data?.caller_phone || "Patient"})`,
            body: isTransferFailed
              ? `Front desk was busy or unanswered. Durable callback task created for ${data?.caller_phone}.`
              : `Patient transferred to ${data?.transferred_to || "reception"}. Reason: ${data?.reason || "Patient request"}.`,
            href: "/app/agents",
            entity_type: "voice_call_transfer",
            entity_id: data?.call_sid || null,
            escalation_level: isTransferFailed ? 2 : 1,
          });

          // Create durable callback task if receptionist was busy or unreachable (CTO item 9)
          if (isTransferFailed && data?.caller_phone) {
            await supabaseAdmin.from("patient_care_tasks").insert({
              organization_id: orgId,
              title: `Urgent Callback: Patient ${data.caller_phone}`,
              task_type: "call",
              priority: "high",
              status: "pending",
              due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins SLA
              notes: `Voice AI attempted transfer to front desk but call was unanswered. Reason: ${data?.reason || "Patient inquiry"}.`,
            });
          }
        }
        break;
      }

      case "appointment.booked": {
        // Voice appointment confirmation
        if (orgId) {
          await supabaseAdmin.from("app_notifications").insert({
            organization_id: orgId,
            notification_type: "task_updated",
            priority: "normal",
            title: `Voice Booking: ${data?.patient_name || "Patient"} with ${data?.doctor_name || "Doctor"}`,
            body: `Confirmed slot: ${data?.appointment_time || "Scheduled slot"} for ${data?.contact_phone || "caller"}.`,
            href: "/app/appointments",
            entity_type: "voice_appointment",
            entity_id: null,
            escalation_level: 0,
          });
        }
        break;
      }

      case "call.completed": {
        // Metering deduction trigger
        const callLogId = data?.call_log_id || data?.id;
        const durationSec = data?.duration_seconds || 0;

        if (orgId && callLogId && durationSec > 0) {
          const billableMinutes = Math.max(1, Math.ceil(durationSec / 60));
          try {
            await recordAndDeduct(orgId, `call_${callLogId}`, "voice", "voice", "IN", billableMinutes);
            await supabaseAdmin
              .from("voice_call_logs")
              .update({ billing_deducted: true, updated_at: new Date().toISOString() })
              .eq("id", callLogId);
          } catch (billingErr) {
            console.error("[Voice Webhook] Automatic post-call metering failed:", billingErr);
          }
        }

        // Auto-Recovery for dropped calls / transfer failures
        if (orgId && data?.outcome === "caller_hung_up" && durationSec > 10 && data?.caller_phone) {
          await supabaseAdmin.from("patient_care_tasks").insert({
            organization_id: orgId,
            title: `Follow-up: Incomplete Call (${data.caller_phone})`,
            task_type: "call",
            priority: "normal",
            status: "pending",
            due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour SLA
            notes: `Caller hung up after ${durationSec}s before appointment was scheduled. Call transcript summarized: "${data?.summary || "Inquiry in progress"}".`,
          });
        }
        break;
      }

      default:
        console.log(`[Voice Webhook] Ignored unhandled event: ${event}`);
    }

    return NextResponse.json({ success: true, event });
  } catch (err: any) {
    console.error("[Voice Webhook] Event processing failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
