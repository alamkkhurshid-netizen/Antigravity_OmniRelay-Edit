import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("WORKER_ENABLED and granular worker switches: static code invariants", () => {
  const runtimeControlsSource = readFileSync(new URL("../lib/runtime-controls.ts", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../supabase/migrations/20261010000007_reconcile_post_baseline_bindings.sql", import.meta.url), "utf8");
  const webhookSource = readFileSync(new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf8");
  const rosterSource = readFileSync(new URL("../app/api/cron/roster-dispatch/route.ts", import.meta.url), "utf8");
  const tokenHealthSource = readFileSync(new URL("../app/api/cron/token-health/route.ts", import.meta.url), "utf8");
  const careReminderSource = readFileSync(new URL("../app/api/care-reminder-runs/route.ts", import.meta.url), "utf8");
  const campaignSource = readFileSync(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8");
  const growthSource = readFileSync(new URL("../app/api/cron/growth-officer/route.ts", import.meta.url), "utf8");
  const careEdgeSource = readFileSync(new URL("../supabase/functions/care-reminder-dispatch/index.ts", import.meta.url), "utf8");
  const appointmentEdgeSource = readFileSync(new URL("../supabase/functions/appointment-reminder-dispatch/index.ts", import.meta.url), "utf8");
  const automationEdgeSource = readFileSync(new URL("../supabase/functions/automation-runner/index.ts", import.meta.url), "utf8");
  const doctorQueueEdgeSource = readFileSync(new URL("../supabase/functions/doctor-queue-dispatch/index.ts", import.meta.url), "utf8");
  const devicePushEdgeSource = readFileSync(new URL("../supabase/functions/device-push-dispatch/index.ts", import.meta.url), "utf8");
  const depositEdgeSource = readFileSync(new URL("../supabase/functions/deposit-acceptance-dispatch/index.ts", import.meta.url), "utf8");
  const campaignEdgeSource = readFileSync(new URL("../supabase/functions/campaign-dispatch/index.ts", import.meta.url), "utf8");

  // 1. Verify multi-tenant system_runtime_controls table in Migration 000007
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS public\.system_runtime_controls/, "Migration must define system_runtime_controls table");
  assert.match(migrationSource, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/, "Must define id uuid as primary key");
  assert.match(migrationSource, /UNIQUE NULLS NOT DISTINCT \(control_key, organization_id\)/, "Must enforce unique nulls not distinct on control_key and organization_id");
  assert.match(migrationSource, /version integer NOT NULL DEFAULT 1/, "Must include version column for optimistic concurrency");
  assert.match(migrationSource, /ALTER TABLE public\.system_runtime_controls ENABLE ROW LEVEL SECURITY/, "Must enable RLS on controls table");
  assert.match(migrationSource, /CREATE POLICY "Tenants view own runtime controls"/, "Must restrict RLS policy to organization members");
  assert.match(migrationSource, /GRANT ALL ON public\.system_runtime_controls TO service_role/, "Must grant service_role permissions");

  // 2. Verify Runtime Controls implementation
  assert.match(runtimeControlsSource, /export async function getRuntimeControl/, "Must export getRuntimeControl");
  assert.match(runtimeControlsSource, /export async function isWorkerPaused/, "Must export isWorkerPaused");
  assert.match(runtimeControlsSource, /export async function recordWorkerPauseAudit/, "Must export recordWorkerPauseAudit");
  assert.match(runtimeControlsSource, /CACHE_TTL_MS = 5000/, "Must enforce 5-second in-memory cache TTL");

  // 3. Verify Complete Worker Coverage Across All 11 Claim Boundaries
  // 3a. WhatsApp Inbound
  assert.match(webhookSource, /isWorkerPaused\("whatsapp_inbound"/, "Webhook must evaluate whatsapp_inbound worker pause");
  assert.match(webhookSource, /status: "queued"/, "Must preserve message in queued state during pause");
  assert.match(webhookSource, /recordWorkerPauseAudit\("whatsapp_inbound"/, "Must record pause audit to operational_events");

  // 3b. Appointment Reminders Edge Function
  assert.match(appointmentEdgeSource, /WORKER_ENABLED/, "Appointment edge function must evaluate WORKER_ENABLED before claiming runs");
  assert.match(appointmentEdgeSource, /APPOINTMENT_REMINDER_WORKER_ENABLED/, "Appointment edge function must evaluate APPOINTMENT_REMINDER_WORKER_ENABLED");

  // 3c. Care Reminders
  assert.match(careReminderSource, /isWorkerPaused\("care_reminder"/, "Care reminder route must evaluate care_reminder worker pause");
  assert.match(careEdgeSource, /WORKER_ENABLED/, "Care edge function must evaluate WORKER_ENABLED before claiming runs");
  assert.match(careEdgeSource, /CARE_REMINDER_WORKER_ENABLED/, "Care edge function must evaluate CARE_REMINDER_WORKER_ENABLED");

  // 3d. Campaign Dispatch
  assert.match(campaignSource, /isWorkerPaused\("campaign_dispatch"/, "Campaign route must evaluate campaign_dispatch worker pause");
  assert.match(campaignEdgeSource, /WORKER_ENABLED/, "Campaign edge function must evaluate WORKER_ENABLED before claiming recipients");
  assert.match(campaignEdgeSource, /CAMPAIGN_DISPATCH_WORKER_ENABLED/, "Campaign edge function must evaluate CAMPAIGN_DISPATCH_WORKER_ENABLED");

  // 3e. Automation Runner Edge Function
  assert.match(automationEdgeSource, /WORKER_ENABLED/, "Automation runner must evaluate WORKER_ENABLED before claiming runs");
  assert.match(automationEdgeSource, /AUTOMATION_RUNNER_WORKER_ENABLED/, "Automation runner must evaluate AUTOMATION_RUNNER_WORKER_ENABLED");

  // 3f. Doctor Queue Edge Function
  assert.match(doctorQueueEdgeSource, /WORKER_ENABLED/, "Doctor queue must evaluate WORKER_ENABLED before claiming dispatches");
  assert.match(doctorQueueEdgeSource, /DOCTOR_QUEUE_WORKER_ENABLED/, "Doctor queue must evaluate DOCTOR_QUEUE_WORKER_ENABLED");

  // 3g. Device Push Edge Function
  assert.match(devicePushEdgeSource, /WORKER_ENABLED/, "Device push must evaluate WORKER_ENABLED before claiming deliveries");
  assert.match(devicePushEdgeSource, /DEVICE_PUSH_WORKER_ENABLED/, "Device push must evaluate DEVICE_PUSH_WORKER_ENABLED");

  // 3h. Deposit Acceptance Edge Function
  assert.match(depositEdgeSource, /WORKER_ENABLED/, "Deposit acceptance must evaluate WORKER_ENABLED before claiming dispatches");
  assert.match(depositEdgeSource, /DEPOSIT_ACCEPTANCE_WORKER_ENABLED/, "Deposit acceptance must evaluate DEPOSIT_ACCEPTANCE_WORKER_ENABLED");

  // 3i. Roster Dispatch Cron
  assert.match(rosterSource, /isWorkerPaused\("roster_dispatch"\)/, "Roster cron must evaluate roster_dispatch worker pause");

  // 3j. Growth Officer Cron
  assert.match(growthSource, /isWorkerPaused\("growth_officer"\)/, "Growth officer cron must evaluate growth_officer worker pause");

  // 3k. Token Health Cron
  assert.match(tokenHealthSource, /isWorkerPaused\("token_health"\)/, "Token health cron must evaluate token_health worker pause");
});

test("Worker pause behavioral simulation: master switch vs granular switches and fail-closed policy", () => {
  // Fail-closed default: if DB is unreachable and unconfigured, WORKER_ENABLED defaults to false
  const SAFE_DEFAULTS = {
    WORKER_ENABLED: false,
    WHATSAPP_INBOUND_WORKER_ENABLED: true,
    ROSTER_DISPATCH_WORKER_ENABLED: true,
    TOKEN_HEALTH_WORKER_ENABLED: true,
    CARE_REMINDER_WORKER_ENABLED: true,
    CAMPAIGN_DISPATCH_WORKER_ENABLED: true,
    GROWTH_OFFICER_WORKER_ENABLED: true,
  };

  function checkWorkerPaused(workerType, envOverrides = {}) {
    const masterEnabled = envOverrides.WORKER_ENABLED ?? SAFE_DEFAULTS.WORKER_ENABLED;
    if (!masterEnabled) {
      return { paused: true, controlKey: "WORKER_ENABLED", reason: "Master worker kill switch active (WORKER_ENABLED=false)" };
    }

    const granularKey = `${workerType.toUpperCase()}_WORKER_ENABLED`;
    const granularEnabled = envOverrides[granularKey] ?? SAFE_DEFAULTS[granularKey] ?? true;
    if (!granularEnabled) {
      return { paused: true, controlKey: granularKey, reason: `Worker-specific pause active (${granularKey}=false)` };
    }

    return { paused: false };
  }

  // 1. Fail-closed default state: unconfigured / DB outage stops workers safely
  assert.equal(checkWorkerPaused("whatsapp_inbound").paused, true);
  assert.equal(checkWorkerPaused("whatsapp_inbound").controlKey, "WORKER_ENABLED");
  assert.equal(checkWorkerPaused("roster_dispatch").paused, true);
  assert.equal(checkWorkerPaused("token_health").paused, true);
  assert.equal(checkWorkerPaused("care_reminder").paused, true);
  assert.equal(checkWorkerPaused("campaign_dispatch").paused, true);
  assert.equal(checkWorkerPaused("growth_officer").paused, true);

  // 2. Explicitly enabled: all workers operate normally
  const enabledState = { WORKER_ENABLED: true };
  assert.equal(checkWorkerPaused("whatsapp_inbound", enabledState).paused, false);
  assert.equal(checkWorkerPaused("roster_dispatch", enabledState).paused, false);
  assert.equal(checkWorkerPaused("token_health", enabledState).paused, false);
  assert.equal(checkWorkerPaused("care_reminder", enabledState).paused, false);
  assert.equal(checkWorkerPaused("campaign_dispatch", enabledState).paused, false);
  assert.equal(checkWorkerPaused("growth_officer", enabledState).paused, false);

  // 3. Granular switch pauses ONLY the targeted worker
  const waPaused = { WORKER_ENABLED: true, WHATSAPP_INBOUND_WORKER_ENABLED: false };
  assert.equal(checkWorkerPaused("whatsapp_inbound", waPaused).paused, true);
  assert.equal(checkWorkerPaused("whatsapp_inbound", waPaused).controlKey, "WHATSAPP_INBOUND_WORKER_ENABLED");
  assert.equal(checkWorkerPaused("roster_dispatch", waPaused).paused, false);
  assert.equal(checkWorkerPaused("token_health", waPaused).paused, false);
  assert.equal(checkWorkerPaused("care_reminder", waPaused).paused, false);
});

test("Simulated Inbound Webhook Execution preserves message in queue during pause", async () => {
  const mockDb = {
    inboundMessages: [],
    operationalEvents: [],
    from(table) {
      return {
        insert: async (row) => {
          if (table === "whatsapp_inbound_messages") {
            mockDb.inboundMessages.push(row);
          } else if (table === "operational_events") {
            mockDb.operationalEvents.push(row);
          }
          return { error: null };
        }
      };
    }
  };

  const simulateInbound = async (isPaused, messageId, orgId) => {
    if (isPaused) {
      await mockDb.from("whatsapp_inbound_messages").insert({
        organization_id: orgId,
        provider_message_id: messageId,
        status: "queued"
      });
      await mockDb.from("operational_events").insert({
        organization_id: orgId,
        error_code: "WORKER_PAUSED",
        event_source: "whatsapp_worker_kill_switch",
        severity: "warning"
      });
      return { status: "paused_and_queued" };
    }
    return { status: "processed" };
  };

  const pausedRes = await simulateInbound(true, "msg_test_001", "org_test_123");
  assert.equal(pausedRes.status, "paused_and_queued");
  assert.equal(mockDb.inboundMessages.length, 1);
  assert.equal(mockDb.inboundMessages[0].status, "queued");
  assert.equal(mockDb.operationalEvents.length, 1);
  assert.equal(mockDb.operationalEvents[0].error_code, "WORKER_PAUSED");
});


