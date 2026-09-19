import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { recordOperationalError, recordTeamAudit } from "@/lib/operations";

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).maybeSingle();
  const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? "member");
  if (!["owner", "admin"].includes(role)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { pilotOwnerName?: string; rollbackOwnerName?: string; plannedStartDate?: string; healthStatus?: string; healthNote?: string };
  const pilotOwnerName = String(payload.pilotOwnerName ?? "").trim(); const rollbackOwnerName = String(payload.rollbackOwnerName ?? "").trim(); const plannedStartDate = String(payload.plannedStartDate ?? "").trim(); const healthStatus = String(payload.healthStatus ?? ""); const healthNote = String(payload.healthNote ?? "").trim();
  const validPlannedStartDate = !plannedStartDate || /^\d{4}-\d{2}-\d{2}$/.test(plannedStartDate) && !Number.isNaN(Date.parse(`${plannedStartDate}T00:00:00Z`));
  if (pilotOwnerName.length < 2 || pilotOwnerName.length > 120 || rollbackOwnerName.length < 2 || rollbackOwnerName.length > 120 || !validPlannedStartDate || !["go","hold"].includes(healthStatus) || (healthNote && (healthNote.length < 3 || healthNote.length > 500))) return NextResponse.json({ error: "Add both owners, an optional valid planned start date, a Go or Hold decision, and an optional short note." }, { status: 400 });
  const { data, error } = await supabase.from("clinic_pilot_controls").upsert({ organization_id: organization.id, pilot_owner_name: pilotOwnerName, rollback_owner_name: rollbackOwnerName, planned_start_date: plannedStartDate || null, health_status: healthStatus, health_note: healthNote || null, reviewed_at: new Date().toISOString(), updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "organization_id" }).select("pilot_owner_name,rollback_owner_name,planned_start_date,health_status,health_note,reviewed_at").single();
  if (error || !data) { await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "pilot.control", code: "PILOT_CONTROL_SAVE_FAILED", safeMessage: "Pilot control could not be saved." }); return NextResponse.json({ error: "Pilot control could not be saved." }, { status: 400 }); }
  await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, eventType: "production_readiness_updated", summary: `Clinic pilot decision updated: ${healthStatus}`, metadata: { health_status: healthStatus, planned_start_date: plannedStartDate || null } });
  return NextResponse.json({ control: data });
}
