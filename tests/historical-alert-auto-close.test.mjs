import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("priority alert refresh auto-closes only stale appointment notification alerts", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260825120000_auto_close_historical_priority_alerts.sql", import.meta.url), "utf8");
  assert.match(migration, /set read_at = now\(\)/);
  assert.match(migration, /n\.entity_type = 'failed_appointment_notification'/);
  assert.match(migration, /r\.failure_reason = 'Appointment no longer exists\.'/);
  assert.match(migration, /now\(\) - interval '24 hours'/);
  assert.match(migration, /r\.status='failed'/);
  assert.doesNotMatch(migration, /insert into public\.messages/i);
  assert.doesNotMatch(migration, /appointment-reminder-dispatch/i);
});
