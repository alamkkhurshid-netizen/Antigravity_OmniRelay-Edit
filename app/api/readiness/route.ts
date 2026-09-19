import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { recordOperationalError, recordTeamAudit } from "@/lib/operations";

const allowedChecks = new Set(["backup_export", "restore_drill", "pilot_booking", "pilot_care_plan", "pilot_follow_up", "pilot_reminder", "pilot_signoff"]);
const allowedStatuses = new Set(["pending", "ready", "blocked"]);
const signoffPrerequisites = ["backup_export", "restore_drill", "pilot_booking", "pilot_care_plan", "pilot_follow_up", "pilot_reminder"];

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).maybeSingle();
  const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? "member");
  if (!["owner", "admin"].includes(role)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const payload = await request.json().catch(() => ({})) as { checkKey?: string; status?: string; notes?: string };
  const checkKey = String(payload.checkKey ?? "");
  const status = String(payload.status ?? "");
  const notes = String(payload.notes ?? "").trim();
  if (!allowedChecks.has(checkKey) || !allowedStatuses.has(status)) return NextResponse.json({ error: "Choose a valid readiness check and status." }, { status: 400 });
  if (status !== "pending" && (notes.length < 3 || notes.length > 500)) return NextResponse.json({ error: "Add a short evidence note between 3 and 500 characters." }, { status: 400 });

  if (checkKey === "pilot_signoff" && status === "ready") {
    const { data: prerequisiteChecks, error: prerequisiteError } = await supabase.from("production_readiness_checks")
      .select("check_key,status")
      .eq("organization_id", organization.id)
      .in("check_key", signoffPrerequisites);
    if (prerequisiteError) {
      await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "production.readiness", code: "READINESS_PREREQUISITE_READ_FAILED", safeMessage: "Pilot sign-off prerequisites could not be verified." });
      return NextResponse.json({ error: "Pilot sign-off prerequisites could not be verified. Try again." }, { status: 400 });
    }
    const readyKeys = new Set((prerequisiteChecks ?? []).filter((item) => item.status === "ready").map((item) => item.check_key));
    const missing = signoffPrerequisites.filter((key) => !readyKeys.has(key));
    if (missing.length) return NextResponse.json({ error: `Complete the ${missing.length} remaining pilot evidence gate${missing.length === 1 ? "" : "s"} before recording final sign-off.` }, { status: 409 });
  }

  const { data, error } = await supabase.from("production_readiness_checks").upsert({
    organization_id: organization.id,
    check_key: checkKey,
    status,
    notes: notes || null,
    evidence_at: status === "ready" ? new Date().toISOString() : null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,check_key" }).select("check_key,status,notes,evidence_at,updated_at").single();

  if (error || !data) {
    await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "production.readiness", code: "READINESS_EVIDENCE_FAILED", safeMessage: "A production-readiness check could not be saved." });
    return NextResponse.json({ error: error?.message ?? "Readiness evidence could not be saved." }, { status: 400 });
  }
  await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, eventType: "production_readiness_updated", summary: `Production readiness updated: ${checkKey.replaceAll("_", " ")}`, metadata: { check_key: checkKey, status } });
  return NextResponse.json({ check: data });
}
