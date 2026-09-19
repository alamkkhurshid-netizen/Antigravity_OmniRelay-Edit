import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260824041245_booking_rollout_acceptance_dependency.sql",
  "utf8",
);

test("booking canary requires acceptance, five observations and zero failures", () => {
  assert.match(migration, /whatsapp_booking_acceptance_ready\(p_organization_id\)/);
  assert.match(migration, /count\(\*\) >= 5/);
  assert.match(migration, /not exists[\s\S]+delivery_status = 'failed'/);
  assert.match(migration, /rollout_review' = 'approved'/);
});

test("managed booking canary is service-only, reversible and rechecked at claim time", () => {
  assert.match(migration, /enable_managed_booking_canary/);
  assert.match(migration, /disable_managed_booking_canary/);
  assert.match(migration, /Service role required/g);
  assert.match(migration, /'execution_mode', 'observe'/);
  assert.match(migration, /private\.managed_booking_rollout_ready\(w\.organization_id, w\.id\)/);
  assert.match(migration, /revoke all on function public\.enable_managed_booking_canary/);
  assert.match(migration, /revoke all on function public\.disable_managed_booking_canary/);
});
