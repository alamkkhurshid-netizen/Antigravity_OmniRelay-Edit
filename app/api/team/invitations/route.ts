import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit, recordOperationalError, recordTeamAudit } from "@/lib/operations";

const roles = new Set(["admin", "member"]);
const clinicRoles = new Set(["doctor", "receptionist", "assistant"]);

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle();
  if (actor?.extra?.role !== "owner") return NextResponse.json({ error: "Only the workspace owner can invite staff." }, { status: 403 });
  if (!await consumeRateLimit(supabase, "team_invite", 10, 3600)) {
    return NextResponse.json({ error: "Invitation limit reached. Please try again later." }, { status: 429 });
  }

  const payload = await request.json().catch(() => ({})) as { email?: string; name?: string; accessRole?: string; clinicRole?: string };
  const email = String(payload.email ?? "").trim().toLowerCase();
  const name = String(payload.name ?? "").trim();
  const accessRole = String(payload.accessRole ?? "member");
  const clinicRole = String(payload.clinicRole ?? "assistant");
  if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2) return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
  if (!roles.has(accessRole) || !clinicRoles.has(clinicRole)) return NextResponse.json({ error: "Choose valid staff permissions." }, { status: 400 });

  const { data: existing } = await supabase.from("agents").select("id,user_id,extra").eq("organization_id", organization.id).eq("ai", false);
  const duplicate = existing?.find((item) => String(item.extra?.invitation?.email ?? "").toLowerCase() === email);
  if (duplicate) return NextResponse.json({ error: "This email already has a membership or pending invitation." }, { status: 409 });

  const invitation = { email, status: "pending", invited_at: new Date().toISOString(), invited_by: user.id };
  const { data: member, error: insertError } = await supabase.from("agents").insert({
    organization_id: organization.id,
    user_id: null,
    name,
    ai: false,
    extra: { role: accessRole, clinic_role: clinicRole, invitation },
  }).select("id,name,extra").single();
  if (insertError || !member) return NextResponse.json({ error: insertError?.message ?? "Invitation could not be created." }, { status: 400 });

  await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, subjectAgentId: member.id, eventType: "invitation_created", summary: `Invitation created for ${name}`, metadata: { access_role: accessRole, clinic_role: clinicRole } });

  try {
    const admin = createAdminClient();
    const origin = new URL(request.url).origin;
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/callback?next=/app/team` });
    if (error && !/already|registered|exists/i.test(error.message)) throw error;
    const delivery = error ? "existing_user" : "email_sent";
    await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, subjectAgentId: member.id, eventType: "invitation_delivered", summary: delivery === "email_sent" ? `Invitation email sent to ${name}` : `Invitation prepared for existing user ${name}`, metadata: { delivery } });
    return NextResponse.json({ member, delivery });
  } catch (error) {
    await supabase.from("agents").delete().eq("id", member.id).eq("organization_id", organization.id);
    await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "team.invitation", code: "INVITATION_DELIVERY_FAILED", safeMessage: "A staff invitation email could not be delivered." });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invitation email could not be sent." }, { status: 503 });
  }
}
