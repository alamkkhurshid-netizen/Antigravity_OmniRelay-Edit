import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260823134500_managed_booking_execution_engine.sql", "utf8");
const runner = fs.readFileSync("supabase/functions/automation-runner/index.ts", "utf8");

test("managed claims require every rollout safety gate", () => {
  assert.match(migration, /w\.trigger_key = 'booking_confirmed'/);
  assert.match(migration, /execution_mode' = 'managed'/);
  assert.match(migration, /rollout_review' = 'approved'/);
  assert.match(migration, /kill_switch/);
  assert.match(migration, /skip locked/i);
  assert.match(migration, /least\(p_limit, 20\)/);
});

test("managed execution has bounded retry, timeout recovery and service-only RPCs", () => {
  assert.match(migration, /attempt_count < r\.max_attempts/);
  assert.match(migration, /worker_timeout/);
  assert.match(migration, /make_interval\(mins => least\(60/);
  assert.match(migration, /service_role/);
  assert.match(migration, /revoke all on function public\.claim_managed_automation_runs/);
});

test("booking runner reconciles the existing dispatcher without creating a duplicate message", () => {
  assert.match(runner, /get_existing_booking_confirmation/);
  assert.match(runner, /confirmation\?\.message_id/);
  assert.match(runner, /waiting_for_confirmation/);
  assert.doesNotMatch(runner, /from\("messages"\)\.insert/);
  assert.doesNotMatch(runner, /fetch\(/);
});
