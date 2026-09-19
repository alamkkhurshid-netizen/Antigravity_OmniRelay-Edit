import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit, recordOperationalError, recordTeamAudit } from "@/lib/operations";

const scenarios = new Set(["commands_handoff", "abandoned_recovery"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { scenario?: string };
  const scenario = String(body.scenario ?? "");
  if (!scenarios.has(scenario)) return NextResponse.json({ error: "Unsupported controlled test." }, { status: 400 });

  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const { data: actor } = await supabase.from("agents").select("id,extra").eq("organization_id", organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle();
  const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? "member");
  if (!actor || !["owner", "admin"].includes(role)) return NextResponse.json({ error: "Only a workspace owner or admin can prepare this test." }, { status: 403 });

  if (!await consumeRateLimit(supabase, `acceptance_prepare_${scenario}`, 3, 3600)) {
    return NextResponse.json({ error: "The controlled test preparation limit was reached." }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data, error } = scenario === "abandoned_recovery"
    ? await admin.rpc("prepare_abandoned_recovery_acceptance", { p_organization_id: organization.id })
    : await admin.rpc("prepare_whatsapp_acceptance_scenario", {
      p_organization_id: organization.id,
      p_scenario_key: scenario,
    });
  if (error || !data) {
    await recordOperationalError({ organizationId: organization.id, actorUserId: user.id, source: "acceptance.channel", code: "CHANNEL_TEST_PREPARE_FAILED", safeMessage: "The controlled channel test could not be prepared." });
    return NextResponse.json({ error: error?.message ?? "The controlled channel test could not be prepared." }, { status: 400 });
  }

  await recordTeamAudit({ organizationId: organization.id, actorUserId: user.id, eventType: "channel_acceptance_prepared", summary: "Controlled WhatsApp acceptance test prepared", metadata: { scenario_key: scenario, max_messages: data.max_messages } });
  return NextResponse.json({ run: { scenario_key: data.scenario_key, status: data.status, recipient_last4: data.recipient_last4, max_messages: data.max_messages, message_count: data.message_count, expires_at: data.expires_at } }, { headers: { "Cache-Control": "no-store" } });
}
