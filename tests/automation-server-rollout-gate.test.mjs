import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260823131500_server_enforced_rollout_gate.sql", "utf8");
const page = fs.readFileSync("app/app/automations/page.tsx", "utf8");

test("rollout readiness is tenant-bound and calculated by the database", () => {
  assert.match(migration, /get_automation_rollout_readiness\(p_organization_id uuid\)/);
  assert.match(migration, /private\.is_organization_member\(p_organization_id, 'member'\)/);
  assert.match(migration, />= 5/);
  assert.match(migration, /failure_count/i);
  assert.match(page, /get_automation_rollout_readiness/);
});

test("rollout approval is administrator-only, audited and does not activate execution", () => {
  assert.match(migration, /private\.is_organization_member\(p_organization_id, 'admin'\)/);
  assert.match(migration, /automation_rollout_reviews/);
  assert.match(migration, /rollout_review', 'approved'/);
  assert.doesNotMatch(migration, /'execution_mode', 'managed'/);
  assert.match(migration, /revoke all on function public\.approve_automation_rollout/);
});
