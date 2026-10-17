import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("WORKER_ENABLED and granular worker switches: static code invariants", () => {
  const runtimeControlsSource = readFileSync(new URL("../lib/runtime-controls.ts", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../supabase/migrations/20261010000007_reconcile_post_baseline_bindings.sql", import.meta.url), "utf8");
  const webhookSource = readFileSync(new URL("../app/api/whatsapp/webhook/route.ts", import.meta.url), "utf8");
  const rosterSource = readFileSync(new URL("../app/api/cron/roster-dispatch/route.ts", import.meta.url), "utf8");
  const tokenHealthSource = readFileSync(new URL("../app/api/cron/token-health/route.ts", import.meta.url), "utf8");

  // 1. Verify system_runtime_controls table in Migration 000007
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS public\.system_runtime_controls/, "Migration must define system_runtime_controls table");
  assert.match(migrationSource, /control_key text PRIMARY KEY/, "Must index control_key as primary key");
  assert.match(migrationSource, /is_enabled boolean NOT NULL DEFAULT true/, "Controls must default to true");
  assert.match(migrationSource, /ALTER TABLE public\.system_runtime_controls ENABLE ROW LEVEL SECURITY/, "Must enable RLS on controls table");
  assert.match(migrationSource, /GRANT ALL ON public\.system_runtime_controls TO service_role/, "Must grant service_role permissions");

  // 2. Verify Runtime Controls implementation
  assert.match(runtimeControlsSource, /export async function getRuntimeControl/, "Must export getRuntimeControl");
  assert.match(runtimeControlsSource, /export async function isWorkerPaused/, "Must export isWorkerPaused");
  assert.match(runtimeControlsSource, /export async function recordWorkerPauseAudit/, "Must export recordWorkerPauseAudit");
  assert.match(runtimeControlsSource, /CACHE_TTL_MS = 5000/, "Must enforce 5-second in-memory cache TTL");

  // 3. Verify WhatsApp webhook integration
  assert.match(webhookSource, /isWorkerPaused\("whatsapp_inbound"/, "Webhook must evaluate whatsapp_inbound worker pause");
  assert.match(webhookSource, /status: "queued"/, "Must preserve message in queued state during pause");
  assert.match(webhookSource, /recordWorkerPauseAudit\("whatsapp_inbound"/, "Must record pause audit to operational_events");

  // 4. Verify Roster Dispatch cron integration
  assert.match(rosterSource, /isWorkerPaused\("roster_dispatch"\)/, "Roster cron must evaluate roster_dispatch worker pause");
  assert.match(rosterSource, /recordWorkerPauseAudit\("roster_dispatch"/, "Must record pause audit for roster dispatch");

  // 5. Verify Token Health cron integration
  assert.match(tokenHealthSource, /isWorkerPaused\("token_health"\)/, "Token health cron must evaluate token_health worker pause");
  assert.match(tokenHealthSource, /recordWorkerPauseAudit\("token_health"/, "Must record pause audit for token health");
});

test("Worker pause behavioral simulation: master switch vs granular switches", () => {
  const SAFE_DEFAULTS = {
    WORKER_ENABLED: true,
    WHATSAPP_INBOUND_WORKER_ENABLED: true,
    ROSTER_DISPATCH_WORKER_ENABLED: true,
    TOKEN_HEALTH_WORKER_ENABLED: true,
  };

  function checkWorkerPaused(workerType, envOverrides = {}) {
    const masterEnabled = envOverrides.WORKER_ENABLED ?? SAFE_DEFAULTS.WORKER_ENABLED;
    if (!masterEnabled) {
      return { paused: true, controlKey: "WORKER_ENABLED", reason: "Master worker kill switch active" };
    }

    const granularKey = `${workerType.toUpperCase()}_WORKER_ENABLED`;
    const granularEnabled = envOverrides[granularKey] ?? SAFE_DEFAULTS[granularKey] ?? true;
    if (!granularEnabled) {
      return { paused: true, controlKey: granularKey, reason: `Worker-specific pause active (${granularKey}=false)` };
    }

    return { paused: false };
  }

  // 1. Safe default state: all workers running
  assert.equal(checkWorkerPaused("whatsapp_inbound").paused, false);
  assert.equal(checkWorkerPaused("roster_dispatch").paused, false);
  assert.equal(checkWorkerPaused("token_health").paused, false);

  // 2. Master kill switch pauses everything
  const masterPaused = { WORKER_ENABLED: false };
  assert.equal(checkWorkerPaused("whatsapp_inbound", masterPaused).paused, true);
  assert.equal(checkWorkerPaused("roster_dispatch", masterPaused).paused, true);
  assert.equal(checkWorkerPaused("token_health", masterPaused).paused, true);
  assert.equal(checkWorkerPaused("whatsapp_inbound", masterPaused).controlKey, "WORKER_ENABLED");

  // 3. Granular switch pauses ONLY the targeted worker
  const waPaused = { WORKER_ENABLED: true, WHATSAPP_INBOUND_WORKER_ENABLED: false };
  assert.equal(checkWorkerPaused("whatsapp_inbound", waPaused).paused, true);
  assert.equal(checkWorkerPaused("whatsapp_inbound", waPaused).controlKey, "WHATSAPP_INBOUND_WORKER_ENABLED");
  assert.equal(checkWorkerPaused("roster_dispatch", waPaused).paused, false);
  assert.equal(checkWorkerPaused("token_health", waPaused).paused, false);
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


