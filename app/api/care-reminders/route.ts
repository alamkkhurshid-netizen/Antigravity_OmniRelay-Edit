import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() || null : null;

const reminderSelect =
  "id,patient_id,prescription_id,prescription_item_id,reminder_type,title,instructions,schedule_kind,scheduled_for,time_of_day,starts_on,ends_on,channel,status,consent_snapshot,next_run_at,last_run_at,created_at";

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const patientId = clean(payload.patientId);
  const title = clean(payload.title);
  const reminderType = clean(payload.reminderType);
  const scheduleKind = clean(payload.scheduleKind);
  const nextRunAt = clean(payload.nextRunAt);
  const channel = clean(payload.channel) ?? "whatsapp";
  if (!patientId || !title || !reminderType || !scheduleKind || !nextRunAt) {
    return NextResponse.json({ error: "Patient, title and schedule are required." }, { status: 400 });
  }
  if (!["medication", "follow_up", "test", "care"].includes(reminderType)) {
    return NextResponse.json({ error: "Unsupported reminder type." }, { status: 400 });
  }
  if (!["one_time", "daily"].includes(scheduleKind)) {
    return NextResponse.json({ error: "Unsupported schedule." }, { status: 400 });
  }
  if (!["whatsapp", "email", "manual"].includes(channel)) {
    return NextResponse.json({ error: "Unsupported channel." }, { status: 400 });
  }
  const nextDate = new Date(nextRunAt);
  if (Number.isNaN(nextDate.getTime()) || nextDate.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "Choose a future reminder time." }, { status: 400 });
  }

  const { data: patient } = await supabase
    .from("patient_profiles")
    .select("id,care_communications_consent")
    .eq("id", patientId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  const prescriptionId = clean(payload.prescriptionId);
  const prescriptionItemId = clean(payload.prescriptionItemId);
  const appointmentId = clean(payload.appointmentId);
  let appointmentStatus: string | null = null;
  if (appointmentId) {
    const { data: appointment } = await supabase.from("appointments").select("id,status").eq("id", appointmentId).eq("patient_id", patientId).eq("organization_id", organization.id).maybeSingle();
    if (!appointment) return NextResponse.json({ error: "Appointment does not belong to this patient." }, { status: 400 });
    appointmentStatus = appointment.status;
  }
  if (prescriptionId) {
    const { data: prescription } = await supabase
      .from("prescriptions")
      .select("id")
      .eq("id", prescriptionId)
      .eq("patient_id", patientId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!prescription) return NextResponse.json({ error: "Prescription does not belong to this patient." }, { status: 400 });
  }
  if (prescriptionItemId) {
    const { data: item } = await supabase
      .from("prescription_items")
      .select("id,prescription_id")
      .eq("id", prescriptionItemId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!item || item.prescription_id !== prescriptionId) {
      return NextResponse.json({ error: "Medicine does not belong to the selected prescription." }, { status: 400 });
    }
  }

  const { data: reminder, error } = await supabase
    .from("care_reminders")
    .insert({
      organization_id: organization.id,
      patient_id: patientId,
      prescription_id: prescriptionId,
      prescription_item_id: prescriptionItemId,
      encounter_id: clean(payload.encounterId),
      reminder_type: reminderType,
      title,
      instructions: clean(payload.instructions),
      schedule_kind: scheduleKind,
      scheduled_for: clean(payload.scheduledFor),
      time_of_day: clean(payload.timeOfDay),
      starts_on: clean(payload.startsOn),
      ends_on: clean(payload.endsOn),
      timezone: "Asia/Kolkata",
      channel,
      status: "active",
      consent_snapshot: patient.care_communications_consent,
      next_run_at: nextDate.toISOString(),
      created_by: user.id,
    })
    .select(reminderSelect)
    .single();
  if (error || !reminder) {
    return NextResponse.json({ error: error?.message ?? "Reminder could not be created." }, { status: 400 });
  }
  let warning: string | null = null;
  if (appointmentId && appointmentStatus === "confirmed") {
    const { error: arrivalError } = await supabase.rpc("update_appointment_status", { p_organization_id: organization.id, p_appointment_id: appointmentId, p_status: "arrived" });
    if (arrivalError) warning = "Reminder was scheduled, but the appointment could not be marked arrived.";
  }
  return NextResponse.json({ reminder, warning });
}

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = clean(payload.id);
  const status = clean(payload.status);
  if (!id || !status || !["active", "paused", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "Valid reminder and status are required." }, { status: 400 });
  }
  const { data: reminder, error } = await supabase
    .from("care_reminders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select(reminderSelect)
    .single();
  if (error || !reminder) {
    return NextResponse.json({ error: error?.message ?? "Reminder could not be updated." }, { status: 400 });
  }
  return NextResponse.json({ reminder });
}
