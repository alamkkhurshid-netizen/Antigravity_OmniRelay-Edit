import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace";
import { consumeRateLimit, recordTeamAudit } from "@/lib/operations";

async function getOwnerContext() {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  if (!organization) return { error: NextResponse.json({ error: "Workspace not found." }, { status: 409 }) };
  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).maybeSingle();
  const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? "member");
  if (!["owner", "admin"].includes(role)) return { error: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  return { supabase, organization, user };
}

export async function POST() {
  const context = await getOwnerContext();
  if ("error" in context) return context.error;
  if (!await consumeRateLimit(context.supabase, "mobile_alert_test", 3, 3600)) return NextResponse.json({ error: "Test limit reached. Try again in an hour." }, { status: 429 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("app_notifications").insert({
    organization_id: context.organization.id,
    recipient_user_id: context.user.id,
    notification_type: "serious_action",
    title: "OmniRelay mobile alert test",
    body: "This is a patient-free device test. No clinic action is required.",
    href: "/app/action-centre",
    entity_type: "device_push_test",
    priority: "high",
    escalation_level: 0,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "The test alert could not be created." }, { status: 409 });
  const { count: activeDevices, error: deviceError } = await admin
    .from("device_push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", context.organization.id)
    .eq("user_id", context.user.id)
    .eq("status", "active");
  if (deviceError) return NextResponse.json({ error: "The test alert was created, but device readiness could not be confirmed." }, { status: 409 });
  await recordTeamAudit({ organizationId: context.organization.id, actorUserId: context.user.id, eventType: "mobile_alert_test_created", summary: "Patient-free mobile alert test created", metadata: { notification_id: data.id } });
  return NextResponse.json({ created: true, active_devices: activeDevices ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
