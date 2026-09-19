import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace";
import { recordTeamAudit } from "@/lib/operations";

export async function POST() {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).maybeSingle();
  const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? "member");
  if (!["owner", "admin"].includes(role)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const admin = createAdminClient();
  const { data: notifications } = await admin.from("app_notifications").select("id,entity_id").eq("organization_id", organization.id).eq("notification_type", "serious_action").eq("entity_type", "failed_appointment_notification").is("read_at", null);
  const eventIds = (notifications ?? []).map((item) => item.entity_id).filter((value): value is string => Boolean(value));
  if (eventIds.length === 0) return NextResponse.json({ archived: 0 });
  const { data: events } = await admin.from("reminder_events").select("id,failure_reason,last_attempt_at,updated_at").eq("organization_id", organization.id).in("id", eventIds);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const historical = new Set((events ?? []).filter((event) => event.failure_reason === "Appointment no longer exists." || new Date(event.last_attempt_at ?? event.updated_at).getTime() < cutoff).map((event) => event.id));
  const notificationIds = (notifications ?? []).filter((item) => item.entity_id && historical.has(item.entity_id)).map((item) => item.id);
  if (notificationIds.length === 0) return NextResponse.json({ archived: 0 });
  const { error } = await admin.from("app_notifications").update({ read_at: new Date().toISOString() }).in("id", notificationIds).eq("organization_id", organization.id).is("read_at", null);
  if (error) return NextResponse.json({ error: "Historical alerts could not be archived." }, { status: 409 });
  await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, eventType: "historical_reminder_alerts_archived", summary: "Historical failed reminder alerts archived without retry", metadata: { count: notificationIds.length } });
  return NextResponse.json({ archived: notificationIds.length }, { headers: { "Cache-Control": "no-store" } });
}
