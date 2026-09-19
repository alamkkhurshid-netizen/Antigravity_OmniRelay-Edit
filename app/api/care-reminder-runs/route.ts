import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const select =
  "id,reminder_id,patient_id,scheduled_for,channel,status,attempt_count,max_attempts,provider_message_id,failure_reason,sent_at,delivered_at,read_at,approved_at,acknowledged_at,acknowledgement,response_kind,response_text,response_received_at,created_at";

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof payload.id === "string" ? payload.id : "";
  const action = typeof payload.action === "string" ? payload.action : "";
  if (!id || !["approve", "retry", "skip", "acknowledge"].includes(action)) {
    return NextResponse.json({ error: "Valid reminder run and action are required." }, { status: 400 });
  }

  const { data: current } = await supabase.from("care_reminder_runs")
    .select("id,status,attempt_count,max_attempts,patient:patient_profiles(care_communications_consent,phone)")
    .eq("id", id).eq("organization_id", organization.id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Reminder run not found." }, { status: 404 });

  const patient = current.patient as unknown as { care_communications_consent: boolean; phone: string | null };
  let update: Record<string, unknown>;
  if (action === "approve") {
    if (!patient?.care_communications_consent) return NextResponse.json({ error: "Patient care consent is required before approval." }, { status: 409 });
    if (!patient.phone) return NextResponse.json({ error: "Patient mobile number is required for WhatsApp." }, { status: 409 });
    update = { status: "approved", approved_by: user.id, approved_at: new Date().toISOString(), next_attempt_at: new Date().toISOString(), failure_reason: null };
  } else if (action === "retry") {
    if (current.attempt_count >= current.max_attempts) return NextResponse.json({ error: "Maximum retry limit reached." }, { status: 409 });
    update = { status: "approved", approved_by: user.id, approved_at: new Date().toISOString(), next_attempt_at: new Date().toISOString(), failure_reason: null };
  } else if (action === "skip") {
    update = { status: "skipped", failure_reason: "Skipped by staff.", next_attempt_at: null };
  } else {
    update = { acknowledged_at: new Date().toISOString(), acknowledgement: "Confirmed by staff" };
  }

  const { data: run, error } = await supabase.from("care_reminder_runs")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id).eq("organization_id", organization.id).select(select).single();
  if (error || !run) return NextResponse.json({ error: error?.message ?? "Reminder run could not be updated." }, { status: 400 });
  return NextResponse.json({ run });
}
