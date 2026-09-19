import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260909180000_schedule_managed_automation_runner.sql", "utf8");
const runner = fs.readFileSync("supabase/functions/automation-runner/index.ts", "utf8");

test("managed automation worker is scheduled with Vault-held credentials", () => {
  assert.match(migration, /run-managed-automation-worker/);
  assert.match(migration, /'\* \* \* \* \*'/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /edge_functions_token/);
  assert.match(migration, /managed_booking_evidence_only/);
});

test("managed automation worker cannot send WhatsApp messages directly", () => {
  assert.doesNotMatch(runner, /fetch\(/);
  assert.doesNotMatch(runner, /from\("messages"\)\.insert/);
});
