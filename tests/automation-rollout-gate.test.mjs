import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("app/app/automations/automation-control-panel.tsx", "utf8");
const page = fs.readFileSync("app/app/automations/page.tsx", "utf8");
const gate = fs.readFileSync("supabase/migrations/20260823131500_server_enforced_rollout_gate.sql", "utf8");

test("managed execution remains gated by clean production evidence", () => {
  assert.match(panel, /MIN_OBSERVATIONS = 5/);
  assert.match(gate, />= 5/);
  assert.match(gate, /failure_count/i);
  assert.match(panel, /Ready to activate/);
  assert.match(panel, /In monitored testing/);
  assert.match(panel, /Needs attention/);
});

test("rollout gate never promotes a workflow from the browser", () => {
  assert.doesNotMatch(panel, /action[^\n]+promote/i);
  assert.doesNotMatch(panel, /execution_mode[^\n]+managed/);
  assert.match(page, /limit\(200\)/);
});
