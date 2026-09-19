import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

type Payload = {
  id?: string;
  patientId?: string;
  encounterId?: string | null;
  appointmentId?: string | null;
  taskType?: string;
  title?: string;
  details?: string | null;
  dueAt?: string | null;
  priority?: string;
  status?: string;
  assignedTo?: string | null;
};

const taskTypes = new Set(["follow_up", "call", "test_review", "document", "care", "other"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);
const statuses = new Set(["open", "in_progress", "completed", "cancelled"]);
const clean = (value: unknown) => typeof value === "string" ? value.trim() || null : null;
const taskSelect = "id,patient_id,encounter_id,appointment_id,care_plan_id,task_type,title,details,due_at,priority,status,assigned_to,created_by,completed_by,completed_at,created_at,updated_at";

async function context() {
  const workspace = await getWorkspace();
  const { data: { user } } = await workspace.supabase.auth.getUser();
  return { ...workspace, user };
}

export async function POST(request: Request) {
  const { supabase, organization, user } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const patientId = clean(payload.patientId);
  const title = clean(payload.title);
  const details = clean(payload.details);
  const dueAt = clean(payload.dueAt);
  const encounterId = clean(payload.encounterId);
  const appointmentId = clean(payload.appointmentId);
  const assignedTo = clean(payload.assignedTo);
  const taskType = clean(payload.taskType) ?? "care";
  const priority = clean(payload.priority) ?? "normal";

  if (!patientId || !title) return NextResponse.json({ error: "Patient and task title are required." }, { status: 400 });
  if (title.length > 160 || (details?.length ?? 0) > 2000) return NextResponse.json({ error: "Task content is too long." }, { status: 400 });
  if (!taskTypes.has(taskType) || !priorities.has(priority)) return NextResponse.json({ error: "Choose a valid task type and priority." }, { status: 400 });
  if (dueAt && Number.isNaN(Date.parse(dueAt))) return NextResponse.json({ error: "Enter a valid due date." }, { status: 400 });

  const { data: patient } = await supabase.from("patient_profiles").select("id").eq("id", patientId).eq("organization_id", organization.id).maybeSingle();
  if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

  if (encounterId) {
    const { data } = await supabase.from("patient_encounters").select("id").eq("id", encounterId).eq("patient_id", patientId).eq("organization_id", organization.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "The selected encounter does not belong to this patient." }, { status: 400 });
  }
  if (appointmentId) {
    const { data } = await supabase.from("appointments").select("id").eq("id", appointmentId).eq("patient_id", patientId).eq("organization_id", organization.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "The selected appointment does not belong to this patient." }, { status: 400 });
  }
  if (assignedTo) {
    const { data } = await supabase.from("agents").select("id").eq("organization_id", organization.id).eq("user_id", assignedTo).maybeSingle();
    if (!data) return NextResponse.json({ error: "The assignee is not a member of this workspace." }, { status: 400 });
  }

  const { data: task, error } = await supabase.from("patient_care_tasks").insert({
    organization_id: organization.id,
    patient_id: patientId,
    encounter_id: encounterId,
    appointment_id: appointmentId,
    task_type: taskType,
    title,
    details,
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    priority,
    status: "open",
    assigned_to: assignedTo,
    created_by: user.id,
  }).select(taskSelect).single();

  if (error || !task) return NextResponse.json({ error: error?.message ?? "Care task could not be created." }, { status: 400 });
  return NextResponse.json({ task });
}

export async function PATCH(request: Request) {
  const { supabase, organization, user } = await context();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = (await request.json().catch(() => ({}))) as Payload;
  const id = clean(payload.id);
  const status = clean(payload.status);
  if (!id || !status || !statuses.has(status)) return NextResponse.json({ error: "Choose a valid task action." }, { status: 400 });

  const { data: task, error } = await supabase.from("patient_care_tasks").update({ status }).eq("id", id).eq("organization_id", organization.id).select(taskSelect).single();
  if (error || !task) return NextResponse.json({ error: error?.message ?? "Care task could not be updated." }, { status: 400 });
  return NextResponse.json({ task });
}
