import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type Payload = {
  id?: string; patientId?: string; encounterId?: string | null; planType?: string;
  title?: string; goal?: string | null; instructions?: string | null; status?: string;
  startsOn?: string; targetDate?: string | null; nextReviewAt?: string | null;
  assignedTo?: string | null; schedulePatientReminder?: boolean;
};

const planTypes = new Set(["chronic_care", "post_visit", "preventive", "recovery", "other"]);
const statuses = new Set(["draft", "active", "paused", "completed", "cancelled"]);
const clean = (value: unknown) => typeof value === "string" ? value.trim() || null : null;
const planSelect = "id,patient_id,encounter_id,plan_type,title,goal,instructions,status,starts_on,target_date,next_review_at,assigned_to,created_by,completed_by,completed_at,created_at,updated_at";
const taskSelect = "id,patient_id,encounter_id,appointment_id,care_plan_id,task_type,title,details,due_at,priority,status,assigned_to,created_by,completed_by,completed_at,created_at,updated_at";

async function context() {
  const workspace = await getWorkspace();
  const { data: { user } } = await workspace.supabase.auth.getUser();
  let role = "member";
  if (user && workspace.organization) {
    const { data } = await workspace.supabase.from("agents").select("extra").eq("organization_id", workspace.organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle();
    role = String(data?.extra?.role ?? "member");
  }
  return { ...workspace, user, canManage: role === "owner" || role === "admin" };
}

async function validateLinks(supabase: Awaited<ReturnType<typeof context>>["supabase"], organizationId: string, patientId: string, encounterId: string | null, assignedTo: string | null) {
  const { data: patient } = await supabase.from("patient_profiles").select("id,phone,care_communications_consent").eq("id", patientId).eq("organization_id", organizationId).maybeSingle();
  if (!patient) return "Patient not found.";
  if (encounterId) {
    const { data } = await supabase.from("patient_encounters").select("id").eq("id", encounterId).eq("patient_id", patientId).eq("organization_id", organizationId).maybeSingle();
    if (!data) return "The selected encounter does not belong to this patient.";
  }
  if (assignedTo) {
    const { data } = await supabase.from("agents").select("id").eq("organization_id", organizationId).eq("user_id", assignedTo).eq("ai", false).maybeSingle();
    if (!data) return "The assignee is not an active clinic team member.";
  }
  return { patient };
}

export async function POST(request: Request) {
  const { supabase, organization, user, canManage } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  if (!canManage) return NextResponse.json({ error: "Only a workspace owner or administrator can create a care plan." }, { status: 403 });

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const patientId = clean(payload.patientId); const encounterId = clean(payload.encounterId);
  const planType = clean(payload.planType) ?? "post_visit"; const title = clean(payload.title);
  const goal = clean(payload.goal); const instructions = clean(payload.instructions);
  const startsOn = clean(payload.startsOn) ?? new Date().toISOString().slice(0, 10);
  const targetDate = clean(payload.targetDate); const nextReviewAt = clean(payload.nextReviewAt);
  const assignedTo = clean(payload.assignedTo);
  if (!patientId || !title) return NextResponse.json({ error: "Patient and care-plan title are required." }, { status: 400 });
  if (!planTypes.has(planType)) return NextResponse.json({ error: "Choose a valid care-plan type." }, { status: 400 });
  if (title.length > 160 || (goal?.length ?? 0) > 1000 || (instructions?.length ?? 0) > 4000) return NextResponse.json({ error: "Care-plan content is too long." }, { status: 400 });
  if (Number.isNaN(Date.parse(startsOn)) || (targetDate && Number.isNaN(Date.parse(targetDate))) || (nextReviewAt && Number.isNaN(Date.parse(nextReviewAt)))) return NextResponse.json({ error: "Enter valid care-plan dates." }, { status: 400 });
  if (targetDate && targetDate < startsOn) return NextResponse.json({ error: "Target date cannot be before the start date." }, { status: 400 });
  const links = await validateLinks(supabase, organization.id, patientId, encounterId, assignedTo);
  if (typeof links === "string") return NextResponse.json({ error: links }, { status: 400 });
  const schedulePatientReminder = payload.schedulePatientReminder === true;
  if (schedulePatientReminder && !nextReviewAt) return NextResponse.json({ error: "Choose a review date before scheduling the patient reminder." }, { status: 400 });
  if (schedulePatientReminder && (!links.patient.care_communications_consent || !clean(links.patient.phone))) return NextResponse.json({ error: "Patient care consent and a mobile number are required for WhatsApp follow-up." }, { status: 409 });

  const { data: plan, error } = await supabase.from("patient_care_plans").insert({
    organization_id: organization.id, patient_id: patientId, encounter_id: encounterId,
    plan_type: planType, title, goal, instructions, status: "active", starts_on: startsOn,
    target_date: targetDate, next_review_at: nextReviewAt ? new Date(nextReviewAt).toISOString() : null,
    assigned_to: assignedTo, created_by: user.id,
  }).select(planSelect).single();
  if (error || !plan) return NextResponse.json({ error: error?.message ?? "Care plan could not be created." }, { status: 400 });
  let patientReminder = null;
  if (schedulePatientReminder && nextReviewAt) {
    const reviewAt = new Date(nextReviewAt).toISOString();
    const reminderInsert = await supabase.from("care_reminders").insert({
      organization_id: organization.id, patient_id: patientId, encounter_id: encounterId, care_plan_id: plan.id,
      reminder_type: "care", title: organization.name,
      instructions: `Care-plan review: ${title}.${instructions ? ` ${instructions}` : " Please contact the clinic if you need assistance."}`,
      schedule_kind: "one_time", scheduled_for: reviewAt, timezone: "Asia/Kolkata", channel: "whatsapp",
      status: "active", consent_snapshot: true, next_run_at: reviewAt, created_by: user.id,
    }).select("id,care_plan_id,status,next_run_at,last_run_at").single();
    if (reminderInsert.error || !reminderInsert.data) {
      await supabase.from("patient_care_plans").delete().eq("id", plan.id).eq("organization_id", organization.id);
      return NextResponse.json({ error: reminderInsert.error?.message ?? "Patient reminder could not be scheduled." }, { status: 400 });
    }
    patientReminder = reminderInsert.data;
  }
  const { data: reviewTask } = await supabase.from("patient_care_tasks").select(taskSelect).eq("care_plan_id", plan.id).maybeSingle();
  return NextResponse.json({ plan, reviewTask: reviewTask ?? null, patientReminder });
}

export async function PATCH(request: Request) {
  const { supabase, organization, user, canManage } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  if (!canManage) return NextResponse.json({ error: "Only a workspace owner or administrator can update a care plan." }, { status: 403 });
  const payload = (await request.json().catch(() => ({}))) as Payload;
  const id = clean(payload.id); const status = clean(payload.status);
  if (!id || !status || !statuses.has(status)) return NextResponse.json({ error: "Choose a valid care-plan action." }, { status: 400 });
  const { data: plan, error } = await supabase.from("patient_care_plans").update({ status }).eq("id", id).eq("organization_id", organization.id).select(planSelect).single();
  if (error || !plan) return NextResponse.json({ error: error?.message ?? "Care plan could not be updated." }, { status: 400 });
  const { data: reviewTask } = await supabase.from("patient_care_tasks").select(taskSelect).eq("care_plan_id", plan.id).maybeSingle();
  return NextResponse.json({ plan, reviewTask: reviewTask ?? null });
}
