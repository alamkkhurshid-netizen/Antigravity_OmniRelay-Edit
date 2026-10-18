import { NextRequest, NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVoiceServiceAuth } from "@/lib/voice/auth";
import {
  maskPhoneNumber,
  sanitizeTranscript,
  scrubPiiText,
} from "@/lib/voice/privacy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { supabase, organization } = await getWorkspace();
    const admin = createAdminClient();

    const { searchParams } = new URL(req.url);
    const requestedOrgId = searchParams.get("org_id");
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);
    const outcome = searchParams.get("outcome");

    // Check if operator or tenant
    let targetOrgId = organization?.id;
    if (requestedOrgId && requestedOrgId !== targetOrgId) {
      const { data: isOperator } = await supabase.rpc("is_oem_operator");
      if (isOperator) {
        targetOrgId = requestedOrgId;
      } else {
        return NextResponse.json({ error: "Forbidden: Cannot access another organization's logs" }, { status: 403 });
      }
    }

    if (!targetOrgId) {
      return NextResponse.json({ error: "Missing organization context" }, { status: 400 });
    }

    let query = admin
      .from("voice_call_logs")
      .select("*")
      .eq("org_id", targetOrgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (outcome) {
      query = query.eq("outcome", outcome);
    }

    const { data: logs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Apply Zero-PII phone masking on returned logs
    const safeLogs = (logs || []).map((l: Record<string, unknown>) => ({
      ...l,
      contact_phone: maskPhoneNumber(String(l.contact_phone || "")),
    }));

    return NextResponse.json({ logs: safeLogs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }

    const org_id = body.org_id ? String(body.org_id) : undefined;
    const contact_phone = body.contact_phone ? String(body.contact_phone) : undefined;
    const direction = body.direction ? String(body.direction) : "inbound";
    const agent_type = body.agent_type ? String(body.agent_type) : "receptionist";
    const vertical = body.vertical ? String(body.vertical) : "clinic";
    const duration_seconds = typeof body.duration_seconds === "number" ? body.duration_seconds : 0;
    const outcome = body.outcome ? String(body.outcome) : undefined;
    const exotel_call_sid = body.exotel_call_sid ? String(body.exotel_call_sid) : undefined;
    const stream_sid = body.stream_sid ? String(body.stream_sid) : undefined;
    const transcript = Array.isArray(body.transcript) ? body.transcript : [];
    const summary = body.summary ? String(body.summary) : undefined;
    const emergency_flag = Boolean(body.emergency_flag);
    const emergency_reason = body.emergency_reason ? String(body.emergency_reason) : undefined;
    const latency_metrics = (body.latency_metrics && typeof body.latency_metrics === "object") ? body.latency_metrics : {};
    const consent_recorded = Boolean(body.consent_recorded);


    // Strict Service-to-Service HMAC, Replay Prevention, and Tenant Boundary Authentication
    const authResult = await verifyVoiceServiceAuth(req, rawBody, org_id);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!org_id || !contact_phone) {
      return NextResponse.json(
        { error: "Missing required fields: org_id, contact_phone" },
        { status: 400 }
      );
    }

    // Privacy Governance: Mask phone number and scrub conversational PII
    const safePhone = maskPhoneNumber(contact_phone);
    const safeTranscript = sanitizeTranscript(transcript, Boolean(consent_recorded));
    const safeSummary = scrubPiiText(summary);
    const safeEmergencyReason = scrubPiiText(emergency_reason);

    const admin = createAdminClient();

    // Check if updating an existing call log by call_sid
    if (exotel_call_sid) {
      const { data: existing } = await admin
        .from("voice_call_logs")
        .select("id")
        .eq("exotel_call_sid", exotel_call_sid)
        .maybeSingle();

      if (existing) {
        const { data: updated, error: updateErr } = await admin
          .from("voice_call_logs")
          .update({
            duration_seconds: Number(duration_seconds),
            outcome,
            transcript: safeTranscript,
            summary: safeSummary || null,
            emergency_flag: Boolean(emergency_flag),
            emergency_reason: safeEmergencyReason || null,
            latency_metrics,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }
        return NextResponse.json({ call_log: updated, updated: true });
      }
    }

    // Insert new call log with privacy sanitization
    const { data: inserted, error: insertErr } = await admin
      .from("voice_call_logs")
      .insert({
        org_id,
        contact_phone: safePhone,
        direction,
        agent_type,
        vertical,
        duration_seconds: Number(duration_seconds),
        outcome: outcome || "inquiry_resolved",
        exotel_call_sid: exotel_call_sid || null,
        stream_sid: stream_sid || null,
        transcript: safeTranscript,
        summary: safeSummary || null,
        emergency_flag: Boolean(emergency_flag),
        emergency_reason: safeEmergencyReason || null,
        latency_metrics,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ call_log: inserted }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
