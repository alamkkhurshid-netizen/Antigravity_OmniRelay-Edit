import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type Payload = {
  id?: string;
  patientId?: string;
  appointmentId?: string | null;
  encounterType?: string;
  occurredAt?: string;
  diagnosis?: string;
  clinicalNote?: string;
  treatmentPlan?: string;
  followUpAt?: string | null;
  followUpStatus?: string;
};

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() || null : null;

const allowedTypes = new Set([
  "consultation",
  "follow_up",
  "procedure",
  "vaccination",
  "other",
]);

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!organization) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  }

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const patientId = clean(payload.patientId);
  const clinicalNote = clean(payload.clinicalNote);
  const encounterType = clean(payload.encounterType) ?? "consultation";
  const occurredAt = clean(payload.occurredAt) ?? new Date().toISOString();
  const followUpAt = clean(payload.followUpAt);

  if (!patientId || !clinicalNote) {
    return NextResponse.json(
      { error: "Patient and clinical note are required." },
      { status: 400 },
    );
  }
  if (!allowedTypes.has(encounterType)) {
    return NextResponse.json({ error: "Invalid encounter type." }, { status: 400 });
  }
  if (Number.isNaN(Date.parse(occurredAt))) {
    return NextResponse.json({ error: "Enter a valid visit date." }, { status: 400 });
  }
  if (followUpAt && Number.isNaN(Date.parse(followUpAt))) {
    return NextResponse.json({ error: "Enter a valid follow-up date." }, { status: 400 });
  }

  const { data: patient } = await supabase
    .from("patient_profiles")
    .select("id,care_communications_consent")
    .eq("id", patientId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  const appointmentId = clean(payload.appointmentId);
  if (appointmentId) {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("id", appointmentId)
      .eq("patient_id", patientId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!appointment) {
      return NextResponse.json(
        { error: "The selected appointment does not belong to this patient." },
        { status: 400 },
      );
    }
  }

  const { data: encounter, error } = await supabase
    .from("patient_encounters")
    .insert({
      organization_id: organization.id,
      patient_id: patientId,
      appointment_id: appointmentId,
      encounter_type: encounterType,
      occurred_at: occurredAt,
      diagnosis: clean(payload.diagnosis),
      clinical_note: clinicalNote,
      treatment_plan: clean(payload.treatmentPlan),
      follow_up_at: followUpAt,
      follow_up_status: followUpAt ? "scheduled" : "not_required",
      created_by: user.id,
    })
    .select(
      "id,patient_id,appointment_id,encounter_type,occurred_at,diagnosis,clinical_note,treatment_plan,follow_up_at,follow_up_status,created_at",
    )
    .single();

  if (error || !encounter) {
    return NextResponse.json(
      { error: error?.message ?? "Clinical record could not be saved." },
      { status: 400 },
    );
  }
  let reminderCreated = false;
  let warning: string | null = null;
  if (followUpAt) {
    const followUpTime = new Date(followUpAt).getTime();
    const reminderTime = new Date(Math.max(Date.now() + 5 * 60_000, followUpTime - 24 * 60 * 60_000));
    const { error: reminderError } = await supabase.from("care_reminders").insert({
      organization_id: organization.id,
      patient_id: patientId,
      encounter_id: encounter.id,
      reminder_type: "follow_up",
      title: "Follow-up visit reminder",
      instructions: "Please confirm or reschedule your follow-up visit with the clinic.",
      schedule_kind: "one_time",
      scheduled_for: reminderTime.toISOString(),
      timezone: "Asia/Kolkata",
      channel: "whatsapp",
      status: "active",
      consent_snapshot: patient.care_communications_consent,
      next_run_at: reminderTime.toISOString(),
      created_by: user.id,
    });
    reminderCreated = !reminderError;
    if (reminderError) warning = "The visit was saved, but its follow-up reminder could not be scheduled.";
    else if (!patient.care_communications_consent) warning = "The follow-up was scheduled, but delivery remains blocked until care consent is recorded.";
  }
  return NextResponse.json({ encounter, reminderCreated, warning });
}

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const id = clean(payload.id);
  const followUpStatus = clean(payload.followUpStatus);
  const followUpAt = clean(payload.followUpAt);
  if (!id || !followUpStatus || !["scheduled", "due", "completed", "cancelled"].includes(followUpStatus)) {
    return NextResponse.json({ error: "A valid follow-up action is required." }, { status: 400 });
  }
  if (followUpAt && Number.isNaN(Date.parse(followUpAt))) {
    return NextResponse.json({ error: "Enter a valid follow-up date." }, { status: 400 });
  }

  const values: Record<string, string> = { follow_up_status: followUpStatus };
  if (followUpAt) values.follow_up_at = new Date(followUpAt).toISOString();
  const { data: encounter, error } = await supabase
    .from("patient_encounters")
    .update(values)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id,patient_id,appointment_id,encounter_type,occurred_at,diagnosis,clinical_note,treatment_plan,follow_up_at,follow_up_status,created_at")
    .single();
  if (error || !encounter) {
    return NextResponse.json({ error: error?.message ?? "Follow-up could not be updated." }, { status: 400 });
  }

  const reminderValues: Record<string, string> = {
    status: followUpStatus === "completed" ? "completed" : followUpStatus === "cancelled" ? "cancelled" : "active",
  };
  if (followUpAt) {
    const followUpTime = new Date(followUpAt).getTime();
    const reminderTime = new Date(Math.max(Date.now() + 5 * 60_000, followUpTime - 24 * 60 * 60_000));
    reminderValues.scheduled_for = reminderTime.toISOString();
    reminderValues.next_run_at = reminderTime.toISOString();
  }
  const { error: reminderError } = await supabase
    .from("care_reminders")
    .update(reminderValues)
    .eq("encounter_id", id)
    .eq("organization_id", organization.id)
    .eq("created_by", user.id);

  return NextResponse.json({
    encounter,
    warning: reminderError ? "The follow-up was updated, but its reminder could not be synchronized." : null,
  });
}
