import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { org_id, call_sid, caller_phone, reason = "Caller requested front desk" } = body;

    if (!org_id) {
      return NextResponse.json({ error: "Missing required parameter: org_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Fetch Tenant Voice Config
    const { data: config } = await admin
      .from("voice_agent_configs")
      .select("receptionist_phone, clinic_name, forwarding_phone_number")
      .eq("org_id", org_id)
      .maybeSingle();

    // 2. Fetch Organization Phone fallback
    const { data: org } = await admin
      .from("organizations")
      .select("name, extra")
      .eq("id", org_id)
      .single();

    const orgExtra = (org?.extra || {}) as Record<string, unknown>;
    const targetPhone = String(
      config?.receptionist_phone ||
      config?.forwarding_phone_number ||
      orgExtra.phone ||
      orgExtra.emergency_phone ||
      "919876543210"
    );

    // 3. Update call log if call_sid is provided
    if (call_sid) {
      await admin
        .from("voice_call_logs")
        .update({
          outcome: "human_transferred",
          summary: `Call transferred to front desk (${targetPhone}). Reason: ${reason}.`,
          updated_at: new Date().toISOString(),
        })
        .eq("exotel_call_sid", call_sid);
    }

    // 4. Create internal notification for front desk
    await admin.from("app_notifications").insert({
      organization_id: org_id,
      notification_type: "task_assigned",
      priority: "high",
      title: `Call Transferred to Reception (${caller_phone || "Caller"})`,
      body: `Voice AI transferred caller to ${targetPhone}. Reason: ${reason}.`,
      href: "/app/agents",
      entity_type: "voice_transfer",
      entity_id: call_sid || null,
      escalation_level: 1,
    });

    // 5. Exotel Passthru XML/JSON telephony bridge response
    const speechPrompt = "Please stay on the line while I connect you to our front desk receptionist.";

    return NextResponse.json({
      success: true,
      transfer: true,
      target_phone: targetPhone,
      speech_prompt: speechPrompt,
      exotel_passthru: {
        action: "dial",
        number: targetPhone,
        callerId: config?.receptionist_phone || targetPhone,
        record: true,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
