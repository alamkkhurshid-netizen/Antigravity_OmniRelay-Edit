import { NextResponse } from "next/server";
import { refreshAutomationWorkerAlerts } from "@/lib/automation-worker-alerts";
import { getWorkspace } from "@/lib/workspace";

export async function GET() {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  await supabase.rpc("refresh_priority_action_alerts", { p_organization_id: organization.id });
  // A failed health reconciliation must never block ordinary notification access.
  await refreshAutomationWorkerAlerts(organization.id).catch(() => ({ created: 0, active: 0 }));
  const [{ count }, { data, error }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabase.from("app_notifications").select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id).eq("recipient_user_id", user.id).is("read_at", null),
    supabase.from("app_notifications").select("id,title,body,href,priority,escalation_level,created_at")
      .eq("organization_id", organization.id).eq("recipient_user_id", user.id)
      .eq("notification_type", "serious_action").is("read_at", null)
      .order("escalation_level", { ascending: false }).order("created_at", { ascending: false }).limit(5),
    supabase.from("app_notifications").select("id,title,body,href,priority,escalation_level,created_at")
      .eq("organization_id", organization.id).eq("recipient_user_id", user.id).is("read_at", null)
      .order("created_at", { ascending: false }).limit(5),
  ]);
  if (error || notificationsError) return NextResponse.json({ error: error?.message ?? notificationsError?.message }, { status: 400 });
  return NextResponse.json({ unread: count ?? 0, critical: data ?? [], notifications: notifications ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const payload = await request.json().catch(() => ({})) as { id?: string; all?: boolean };
  let query = supabase.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", organization.id).eq("recipient_user_id", user.id).is("read_at", null).neq("notification_type", "serious_action");
  if (!payload.all && payload.id) query = query.eq("id", payload.id);
  if (!payload.all && !payload.id) return NextResponse.json({ error: "Notification is required." }, { status: 400 });
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ updated: true });
}
