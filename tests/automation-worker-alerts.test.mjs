import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("worker alerts are privacy-safe, tenant-scoped, and self-resolving", async () => {
  const source = await readFile(new URL("../lib/automation-worker-alerts.ts", import.meta.url), "utf8");
  assert.match(source, /PROCESSING_STALL_MS = 15 \* 60_000/);
  assert.match(source, /QUEUE_DELAY_MS = 5 \* 60_000/);
  assert.match(source, /eq\("organization_id", organizationId\)/);
  assert.match(source, /entity_type: ALERT_ENTITY_TYPE/);
  assert.match(source, /href: "\/app\/automations"/);
  assert.match(source, /resolvedNotificationIds/);
  assert.doesNotMatch(source, /patient_id|appointment_id|message_text/);
});

test("notification refresh reconciles worker attention before returning alerts", async () => {
  const source = await readFile(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
  assert.match(source, /refreshAutomationWorkerAlerts\(organization.id\)/);
  assert.match(source, /refresh_priority_action_alerts/);
});

test("scheduled automation runner reconciles alerts without a browser session", async () => {
  const source = await readFile(new URL("../supabase/functions/automation-runner/index.ts", import.meta.url), "utf8");
  assert.match(source, /async function reconcileWorkerAlerts/);
  assert.match(source, /await reconcileWorkerAlerts\(\)/);
  assert.match(source, /WORKER_ALERT_ENTITY_TYPE/);
  assert.match(source, /href: "\/app\/automations"/);
  assert.match(source, /select\("id,organization_id,status,started_at,next_attempt_at"\)/);
  assert.match(source, /deliberately operational-only/);
});

test("offline worker monitor is private, scheduled, and patient-data free", async () => {
  const source = await readFile(new URL("../supabase/migrations/20260830043000_offline_automation_worker_alerts.sql", import.meta.url), "utf8");
  assert.match(source, /create or replace function private\.reconcile_automation_worker_alerts/);
  assert.match(source, /'reconcile-automation-worker-alerts'/);
  assert.match(source, /'\* \* \* \* \*'/);
  assert.match(source, /organization owners and administrators/);
  assert.doesNotMatch(source, /patient_id|appointment_id|message_id/i);
});

test("device push dispatcher fails safely when its VAPID configuration is unavailable", async () => {
  const source = await readFile(new URL("../supabase/functions/device-push-dispatch/index.ts", import.meta.url), "utf8");
  assert.match(source, /VAPID configuration is missing/);
  assert.match(source, /await import\("npm:web-push@3\.6\.7"\)/);
  assert.doesNotMatch(source, /import webpush from/);
  assert.match(source, /Unexpected device push dispatcher failure/);
  assert.match(source, /status: 503/);
  assert.doesNotMatch(source, /patient_id|appointment_id|message_text/i);
});

test("device push queue claim is exposed only through a service-role RPC bridge", async () => {
  const source = await readFile(new URL("../supabase/migrations/20260830053000_expose_service_device_push_claim.sql", import.meta.url), "utf8");
  assert.match(source, /public\.claim_due_device_push_deliveries/);
  assert.match(source, /private\.claim_due_device_push_deliveries/);
  assert.match(source, /revoke all.*from public, anon, authenticated/);
  assert.match(source, /grant execute.*to service_role/);
  assert.doesNotMatch(source, /patient_id|appointment_id|message_text/i);
});
