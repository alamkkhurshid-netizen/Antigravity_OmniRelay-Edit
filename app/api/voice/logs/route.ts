import { NextRequest, NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

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

    return NextResponse.json({ logs: logs || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      org_id,
      contact_phone,
      direction = "inbound",
      agent_type = "receptionist",
      vertical = "clinic",
      duration_seconds = 0,
      outcome,
      exotel_call_sid,
      stream_sid,
      transcript = [],
      summary,
      emergency_flag = false,
      emergency_reason,
      latency_metrics = {},
    } = body;

    if (!org_id || !contact_phone) {
      return NextResponse.json(
        { error: "Missing required fields: org_id, contact_phone" },
        { status: 400 }
      );
    }

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
            transcript,
            summary,
            emergency_flag: Boolean(emergency_flag),
            emergency_reason: emergency_reason || null,
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

    // Insert new call log
    const { data: inserted, error: insertErr } = await admin
      .from("voice_call_logs")
      .insert({
        org_id,
        contact_phone,
        direction,
        agent_type,
        vertical,
        duration_seconds: Number(duration_seconds),
        outcome: outcome || "inquiry_resolved",
        exotel_call_sid: exotel_call_sid || null,
        stream_sid: stream_sid || null,
        transcript,
        summary: summary || null,
        emergency_flag: Boolean(emergency_flag),
        emergency_reason: emergency_reason || null,
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
