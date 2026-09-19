import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { recordOperationalError, recordTeamAudit } from "@/lib/operations";

const allowedStatuses = new Set(["clean", "paused", "follow_up"]);

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).maybeSingle();
  const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? "member");
  if (!["owner", "admin"].includes(role)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { status?: string; note?: string };
  const status = String(payload.status ?? ""); const note = String(payload.note ?? "").trim();
  if (!allowedStatuses.has(status) || note.length < 3 || note.length > 500) return NextResponse.json({ error: "Choose a closeout status and add a safe note between 3 and 500 characters." }, { status: 400 });
  try {
    await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, eventType: "clinic_pilot_day_closed", summary: `Clinic pilot day closeout: ${status.replaceAll("_", " ")}`, metadata: { pilot_closeout_status: status } });
    return NextResponse.json({ status, recordedAt: new Date().toISOString() });
  } catch {
    await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "pilot.closeout", code: "PILOT_CLOSEOUT_SAVE_FAILED", safeMessage: "Pilot closeout could not be saved." });
    return NextResponse.json({ error: "Pilot closeout could not be saved." }, { status: 400 });
  }
}
