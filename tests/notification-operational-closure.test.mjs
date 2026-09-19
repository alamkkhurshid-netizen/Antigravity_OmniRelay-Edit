import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260824150000_suppress_historical_reminder_alerts.sql", import.meta.url), "utf8");
const testRoute = readFileSync(new URL("../app/api/notifications/test/route.ts", import.meta.url), "utf8");
const archiveRoute = readFileSync(new URL("../app/api/notifications/historical/route.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");

test("historical reminder failures no longer regenerate critical alerts", () => {
  assert.match(migration, /failure_reason is distinct from 'Appointment no longer exists\.'/);
  assert.match(migration, /last_attempt_at,r\.updated_at,r\.created_at\)>=now\(\)-interval '24 hours'/);
});

test("historical archive is administrator-only and never retries a message", () => {
  assert.match(archiveRoute, /\["owner", "admin"\]/);
  assert.match(archiveRoute, /historical_reminder_alerts_archived/);
  assert.doesNotMatch(archiveRoute, /operations\/retry|whatsapp\/dispatch/);
});

test("mobile alert test is rate-limited, audited and contains no patient data", () => {
  assert.match(testRoute, /mobile_alert_test/);
  assert.match(testRoute, /Patient-free mobile alert test created/);
  assert.match(testRoute, /active_devices/);
  assert.match(testRoute, /device_push_subscriptions/);
  assert.doesNotMatch(testRoute, /patient_name|customer_name|phone/i);
  assert.match(shell, /pushDeliveryReady/);
});
