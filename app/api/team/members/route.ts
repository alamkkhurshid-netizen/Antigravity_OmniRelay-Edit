import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { consumeRateLimit, recordOperationalError, recordTeamAudit } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";

const accessRoles = new Set(["admin", "member"]);
const clinicRoles = new Set(["doctor", "receptionist", "assistant"]);

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle();
  if (actor?.extra?.role !== "owner") return NextResponse.json({ error: "Only the workspace owner can change roles." }, { status: 403 });

  const payload = await request.json().catch(() => ({})) as { id?: string; accessRole?: string; clinicRole?: string; action?: string };
  const id = String(payload.id ?? "");
  const action = String(payload.action ?? "roles");
  const accessRole = String(payload.accessRole ?? "member");
  const clinicRole = String(payload.clinicRole ?? "assistant");
  if (!id || !["roles", "reactivate"].includes(action)) return NextResponse.json({ error: "Choose a valid team action." }, { status: 400 });
  if (action === "roles" && (!accessRoles.has(accessRole) || !clinicRoles.has(clinicRole))) return NextResponse.json({ error: "Choose valid staff permissions." }, { status: 400 });
  if (!await consumeRateLimit(supabase, action === "reactivate" ? "team_reactivate" : "team_role_change", action === "reactivate" ? 10 : 30, 3600)) {
    return NextResponse.json({ error: "Team change limit reached. Please try again later." }, { status: 429 });
  }

  const { data: member } = await supabase.from("agents").select("id,user_id,extra").eq("id", id).eq("organization_id", organization.id).eq("ai", false).maybeSingle();
  if (!member) return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  if (member.user_id === user.id || member.extra?.role === "owner") return NextResponse.json({ error: "The workspace owner role cannot be changed here." }, { status: 400 });
  const previousRole = String(member.extra?.role ?? "member");
  const previousClinicRole = String(member.extra?.clinic_role ?? "assistant");
  const extra = action === "reactivate"
    ? { ...(member.extra ?? {}), status: "active", reactivated_at: new Date().toISOString(), reactivated_by: user.id }
    : { ...(member.extra ?? {}), role: accessRole, clinic_role: clinicRole };
  const { data, error } = await supabase.from("agents").update({ extra }).eq("id", id).eq("organization_id", organization.id).select("id,name,user_id,extra").single();
  if (error || !data) {
    await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "team.members", code: "MEMBER_UPDATE_FAILED", safeMessage: "A team membership change could not be saved." });
    return NextResponse.json({ error: error?.message ?? "Team member could not be updated." }, { status: 400 });
  }
  await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, subjectAgentId: id, eventType: action === "reactivate" ? "member_reactivated" : "member_role_changed", summary: action === "reactivate" ? `${data.name} was reactivated` : `${data.name}'s permissions were updated`, metadata: action === "reactivate" ? {} : { previous_role: previousRole, role: accessRole, previous_clinic_role: previousClinicRole, clinic_role: clinicRole } });
  return NextResponse.json({ member: data });
}

export async function DELETE(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle();
  if (actor?.extra?.role !== "owner") return NextResponse.json({ error: "Only the workspace owner can remove staff." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Team member is required." }, { status: 400 });
  if (!await consumeRateLimit(supabase, "team_deactivate", 10, 3600)) return NextResponse.json({ error: "Deactivation limit reached. Please try again later." }, { status: 429 });
  const { data: member } = await supabase.from("agents").select("name,user_id,extra").eq("id", id).eq("organization_id", organization.id).eq("ai", false).maybeSingle();
  if (!member || member.user_id === user.id || member.extra?.role === "owner") return NextResponse.json({ error: "The workspace owner cannot be removed." }, { status: 400 });
  const pending = !member.user_id && member.extra?.invitation?.status === "pending";
  const extra = pending
    ? { ...(member.extra ?? {}), invitation: { ...(member.extra?.invitation ?? {}), status: "revoked", revoked_at: new Date().toISOString(), revoked_by: user.id }, status: "disabled" }
    : { ...(member.extra ?? {}), status: "disabled", deactivated_at: new Date().toISOString(), deactivated_by: user.id };
  // Pending invitation metadata is immutable through normal RLS. This privileged
  // write is limited to the already owner-authorized server-side revocation path.
  const writer = pending ? createAdminClient() : supabase;
  const { data, error } = await writer.from("agents").update({ extra }).eq("id", id).eq("organization_id", organization.id).select("id,name,user_id,extra").single();
  if (error || !data) {
    await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "team.members", code: "MEMBER_DEACTIVATION_FAILED", safeMessage: "A team member could not be deactivated." });
    return NextResponse.json({ error: error?.message ?? "Team member could not be deactivated." }, { status: 400 });
  }
  await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, subjectAgentId: id, eventType: pending ? "invitation_revoked" : "member_deactivated", summary: pending ? `Invitation for ${member.name} was revoked` : `${member.name} was deactivated` });
  return NextResponse.json({ member: data, deactivated: true });
}
