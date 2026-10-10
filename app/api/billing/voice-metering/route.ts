import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { recordAndDeduct } from "@/lib/billing/deduction-engine";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Replay cache to reject duplicate webhook event/request IDs within 10 minutes
const processedEventIds = new Map<string, number>();

function checkAndRecordReplay(eventId: string, now: number): boolean {
  for (const [id, ts] of processedEventIds.entries()) {
    if (now - ts > 600) processedEventIds.delete(id);
  }
  if (processedEventIds.has(eventId)) {
    return false;
  }
  processedEventIds.set(eventId, now);
  return true;
}

/**
 * Validates authentication strictly via:
 * 1. HMAC-SHA256 signature (X-OmniRelay-Signature, X-OmniRelay-Timestamp) using dedicated VOICE_WEBHOOK_SECRET
 * 2. Dedicated VOICE_ENGINE_API_KEY bearer credential
 * Fails closed if secrets are absent or mismatched.
 */
function verifyAuth(req: NextRequest, rawBody: string): boolean {
  const webhookSecret = process.env.VOICE_WEBHOOK_SECRET;
  const signature = req.headers.get("x-omnirelay-signature");
  const timestampStr = req.headers.get("x-omnirelay-timestamp");
  const eventId = req.headers.get("x-omnirelay-event-id") || req.headers.get("x-omnirelay-request-id") || signature;

  const now = Math.floor(Date.now() / 1000);

  // 1. Check HMAC signature if present
  if (signature && timestampStr) {
    if (!webhookSecret) {
      console.error("[Voice Metering] VOICE_WEBHOOK_SECRET is not configured on server. Rejecting request.");
      return false;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
      console.warn("[Voice Metering] Webhook timestamp expired or clock drifted:", timestamp);
      return false;
    }

    if (eventId && !checkAndRecordReplay(eventId, now)) {
      console.warn("[Voice Metering] Replay detected for event/request ID:", eventId);
      return false;
    }

    const toSign = `${timestamp}.${rawBody}`;
    const expectedSig = "v1=" + crypto.createHmac("sha256", webhookSecret).update(toSign).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      return true;
    }
    console.warn("[Voice Metering] HMAC signature mismatch.");
    return false;
  }

  // 2. Dedicated Voice Engine API Key (strictly VOICE_ENGINE_API_KEY only)
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const dedicatedApiKey = process.env.VOICE_ENGINE_API_KEY;

  if (token && dedicatedApiKey) {
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(dedicatedApiKey);
    if (tokenBuf.length === keyBuf.length && crypto.timingSafeEqual(tokenBuf, keyBuf)) {
      return true;
    }
  }

  return false;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // 1. Authenticate Request
    if (!verifyAuth(req, rawBody)) {
      return NextResponse.json(
        { error: "Unauthorized. Missing or invalid signature / service credential." },
        { status: 401 }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Support both Supabase Webhook format (payload.record) and direct JSON ({ call_id, log_id })
    const submittedId = payload?.record?.id || payload?.call_id || payload?.log_id || payload?.id;

    if (!submittedId) {
      return NextResponse.json({ error: "Missing call log ID in payload" }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // 2. Load the call record from the DATABASE using its ID (NEVER trust caller's duration/org_id)
    const { data: trustedCall, error: fetchError } = await supabaseAdmin
      .from("voice_call_logs")
      .select("id, org_id, duration_seconds, outcome, cost_inr, billing_deducted, created_at")
      .eq("id", submittedId)
      .maybeSingle();

    if (fetchError) {
      console.error("[Voice Metering] Database lookup failed:", fetchError);
      return NextResponse.json({ error: `Database error: ${fetchError.message}` }, { status: 500 });
    }

    if (!trustedCall) {
      return NextResponse.json({ error: `Call log record '${submittedId}' not found.` }, { status: 404 });
    }

    // 3. Validate that the call has ended and is eligible for billing
    if (!trustedCall.org_id) {
      return NextResponse.json({ error: "Call record missing associated organization_id" }, { status: 422 });
    }

    // Unconnected / 0s calls (immediate hangup before connect)
    const durationSeconds = trustedCall.duration_seconds || 0;
    if (durationSeconds <= 0) {
      return NextResponse.json({
        status: "zero_duration",
        message: "Call has 0 billable duration. No deduction necessary.",
        billed_minutes: 0,
        cost_inr: 0,
      });
    }

    // Billable duration calculated in 60-second standard pulses (rounded up)
    const billableMinutes = Math.max(1, Math.ceil(durationSeconds / 60));

    // 4. Perform atomic deduction with row-level lock and idempotency
    const deduction = await recordAndDeduct(
      trustedCall.org_id,
      `call_${trustedCall.id}`,
      "voice",
      "voice",
      "IN",
      billableMinutes
    );

    // 5. Update voice call log with verified cost and deduction confirmation
    const { error: updateError } = await supabaseAdmin
      .from("voice_call_logs")
      .update({
        cost_inr: deduction.deductedInr,
        billing_deducted: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", trustedCall.id);

    if (updateError) {
      console.error("[Voice Metering] Failed to update call log deduction status:", updateError);
      return NextResponse.json(
        { error: `Deduction recorded, but call log update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    console.log(
      `[Voice Metering] Billed org ${trustedCall.org_id} ₹${deduction.deductedInr} ` +
      `for ${billableMinutes}m call (${trustedCall.id}). Balance remaining: ₹${deduction.newBalanceInr}`
    );

    return NextResponse.json({
      success: true,
      log_id: trustedCall.id,
      already_billed: deduction.alreadyDeducted,
      billed_minutes: billableMinutes,
      cost_inr: deduction.deductedInr,
      balance_remaining_inr: deduction.newBalanceInr,
      ledger_id: deduction.ledgerId,
      warning_triggered: deduction.warningTriggered,
      critical_triggered: deduction.criticalTriggered,
    });
  } catch (error: any) {
    console.error("[Voice Metering] Metering deduction failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
