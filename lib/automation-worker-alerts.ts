import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const PROCESSING_STALL_MS = 15 * 60_000;
const QUEUE_DELAY_MS = 5 * 60_000;
const ALERT_ENTITY_TYPE = "automation_worker_attention";

type AutomationRun = {
  id: string;
  status: string;
  started_at: string | null;
  next_attempt_at: string | null;
};

function needsAttention(run: AutomationRun, now: number) {
  if (run.status === "processing" && run.started_at) {
    return now - new Date(run.started_at).getTime() > PROCESSING_STALL_MS;
  }
  if (["queued", "retrying"].includes(run.status) && run.next_attempt_at) {
    return now - new Date(run.next_attempt_at).getTime() > QUEUE_DELAY_MS;
  }
  return false;
}

/**
 * Reconciles a tenant's privacy-safe automation-health alerts. It deliberately
 * contains no patient, appointment, phone, or message content.
 */
export async function refreshAutomationWorkerAlerts(organizationId: string) {
  const admin = createAdminClient();
  const [{ data: runs, error: runsError }, { data: administrators, error: administratorsError }] = await Promise.all([
    admin.from("automation_runs")
      .select("id,status,started_at,next_attempt_at")
      .eq("organization_id", organizationId)
      .in("status", ["processing", "queued", "retrying"])
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("agents")
      .select("user_id,extra")
      .eq("organization_id", organizationId)
      .eq("ai", false)
      .not("user_id", "is", null),
  ]);

  if (runsError || administratorsError) return { created: 0, active: 0 };

  const delayedRuns = ((runs ?? []) as AutomationRun[]).filter((run) => needsAttention(run, Date.now()));
  const adminUserIds = (administrators ?? [])
    .filter((agent) => {
      const extra = (agent.extra ?? {}) as Record<string, unknown>;
      return ["owner", "admin"].includes(String(extra.role ?? "member")) && String(extra.status ?? "active") !== "inactive";
    })
    .map((agent) => agent.user_id)
    .filter((value): value is string => Boolean(value));

  const { data: existing } = await admin.from("app_notifications")
    .select("id,recipient_user_id,entity_id")
    .eq("organization_id", organizationId)
    .eq("entity_type", ALERT_ENTITY_TYPE)
    .is("read_at", null);

  const open = existing ?? [];
  const activeRunIds = new Set(delayedRuns.map((run) => run.id));
  const resolvedNotificationIds = open.filter((item) => !item.entity_id || !activeRunIds.has(item.entity_id)).map((item) => item.id);
  if (resolvedNotificationIds.length) {
    await admin.from("app_notifications").update({ read_at: new Date().toISOString() }).in("id", resolvedNotificationIds).is("read_at", null);
  }

  const openKeys = new Set(open.filter((item) => item.entity_id && activeRunIds.has(item.entity_id)).map((item) => `${item.recipient_user_id}:${item.entity_id}`));
  const inserts = delayedRuns.flatMap((run) => adminUserIds
    .filter((userId) => !openKeys.has(`${userId}:${run.id}`))
    .map((userId) => ({
      organization_id: organizationId,
      recipient_user_id: userId,
      notification_type: "serious_action",
      title: "Automation worker needs attention",
      body: "A clinic automation is delayed or still processing. Review worker health before reminders become failures.",
      href: "/app/automations",
      entity_type: ALERT_ENTITY_TYPE,
      entity_id: run.id,
      priority: "high",
      escalation_level: 1,
    })));

  if (inserts.length) await admin.from("app_notifications").insert(inserts);
  return { created: inserts.length, active: delayedRuns.length };
}

export const automationWorkerAlertPolicy = {
  processingStallMinutes: PROCESSING_STALL_MS / 60_000,
  queueDelayMinutes: QUEUE_DELAY_MS / 60_000,
  entityType: ALERT_ENTITY_TYPE,
};
