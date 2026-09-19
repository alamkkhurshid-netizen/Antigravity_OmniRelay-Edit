import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

type ManagedRun = {
  id: string;
  organization_id: string;
  trigger_key: string;
  source_id: string | null;
};

const WORKER_ALERT_ENTITY_TYPE = "automation_worker_attention";
const PROCESSING_STALL_MS = 15 * 60_000;
const QUEUE_DELAY_MS = 5 * 60_000;

type WorkerHealthRun = {
  id: string;
  organization_id: string;
  status: string;
  started_at: string | null;
  next_attempt_at: string | null;
};

function needsWorkerAttention(run: WorkerHealthRun, now: number) {
  if (run.status === "processing" && run.started_at) return now - new Date(run.started_at).getTime() > PROCESSING_STALL_MS;
  if (["queued", "retrying"].includes(run.status) && run.next_attempt_at) return now - new Date(run.next_attempt_at).getTime() > QUEUE_DELAY_MS;
  return false;
}

// This runs inside the scheduled worker, not a browser request. Its payload is
// deliberately operational-only: no patient, appointment, or message content.
async function reconcileWorkerAlerts() {
  const { data: candidates, error } = await db.from("automation_runs")
    .select("id,organization_id,status,started_at,next_attempt_at")
    .in("status", ["processing", "queued", "retrying"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return;

  const affected = ((candidates ?? []) as WorkerHealthRun[]).filter((run) => needsWorkerAttention(run, Date.now()));
  const organizationIds = [...new Set((candidates ?? []).map((run) => run.organization_id))];
  if (!organizationIds.length) return;

  const [{ data: administrators }, { data: existing }] = await Promise.all([
    db.from("agents").select("organization_id,user_id,extra").in("organization_id", organizationIds).eq("ai", false).not("user_id", "is", null),
    db.from("app_notifications").select("id,organization_id,recipient_user_id,entity_id").in("organization_id", organizationIds).eq("entity_type", WORKER_ALERT_ENTITY_TYPE).is("read_at", null),
  ]);

  const activeKeys = new Set(affected.map((run) => `${run.organization_id}:${run.id}`));
  const resolvedIds = (existing ?? []).filter((alert) => !activeKeys.has(`${alert.organization_id}:${alert.entity_id}`)).map((alert) => alert.id);
  if (resolvedIds.length) await db.from("app_notifications").update({ read_at: new Date().toISOString() }).in("id", resolvedIds).is("read_at", null);

  const openKeys = new Set((existing ?? []).filter((alert) => activeKeys.has(`${alert.organization_id}:${alert.entity_id}`)).map((alert) => `${alert.organization_id}:${alert.recipient_user_id}:${alert.entity_id}`));
  const inserts = affected.flatMap((run) => (administrators ?? [])
    .filter((agent) => {
      const extra = (agent.extra ?? {}) as Record<string, unknown>;
      return agent.organization_id === run.organization_id && ["owner", "admin"].includes(String(extra.role ?? "member")) && String(extra.status ?? "active") !== "inactive";
    })
    .filter((agent) => agent.user_id && !openKeys.has(`${run.organization_id}:${agent.user_id}:${run.id}`))
    .map((agent) => ({
      organization_id: run.organization_id,
      recipient_user_id: agent.user_id,
      notification_type: "serious_action",
      title: "Automation worker needs attention",
      body: "A clinic automation is delayed or still processing. Review worker health before reminders become failures.",
      href: "/app/automations",
      entity_type: WORKER_ALERT_ENTITY_TYPE,
      entity_id: run.id,
      priority: "high",
      escalation_level: 1,
    })));
  if (inserts.length) await db.from("app_notifications").insert(inserts);
}

Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || token !== serviceKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await db.rpc("recover_stale_managed_automation_runs");
  await reconcileWorkerAlerts();
  const { data: claimed, error } = await db.rpc("claim_managed_automation_runs", { p_limit: 10 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let succeeded = 0;
  let retrying = 0;
  let failed = 0;

  for (const raw of claimed ?? []) {
    const run = raw as ManagedRun;
    if (run.trigger_key !== "booking_confirmed" || !run.source_id) {
      await db.rpc("complete_managed_automation_run", {
        p_run_id: run.id,
        p_succeeded: false,
        p_retryable: false,
        p_failure_code: "unsupported_source",
        p_failure_summary: "Managed execution source is not supported.",
      });
      failed++;
      continue;
    }

    const { data: confirmations, error: confirmationError } = await db.rpc(
      "get_existing_booking_confirmation",
      { p_organization_id: run.organization_id, p_appointment_id: run.source_id },
    );
    const confirmation = confirmations?.[0] as { message_id: string | null; outcome: string } | undefined;

    if (confirmationError) {
      await db.rpc("complete_managed_automation_run", {
        p_run_id: run.id,
        p_succeeded: false,
        p_retryable: true,
        p_failure_code: "confirmation_reconciliation_error",
        p_failure_summary: "Existing booking confirmation could not be reconciled safely.",
      });
      retrying++;
    } else if (confirmation?.message_id) {
      await db.rpc("complete_managed_automation_run", {
        p_run_id: run.id,
        p_succeeded: true,
        p_retryable: false,
        p_observed_message_id: confirmation.message_id,
      });
      succeeded++;
    } else if (confirmation?.outcome === "failed") {
      await db.rpc("complete_managed_automation_run", {
        p_run_id: run.id,
        p_succeeded: false,
        p_retryable: false,
        p_failure_code: "booking_confirmation_failed",
        p_failure_summary: "Booking confirmation delivery failed. Review Operations health.",
      });
      failed++;
    } else {
      await db.rpc("complete_managed_automation_run", {
        p_run_id: run.id,
        p_succeeded: false,
        p_retryable: true,
        p_failure_code: "waiting_for_confirmation",
        p_failure_summary: "Waiting for the existing booking-confirmation dispatcher.",
      });
      retrying++;
    }
  }

  return Response.json({ processed: claimed?.length ?? 0, succeeded, retrying, failed });
});
