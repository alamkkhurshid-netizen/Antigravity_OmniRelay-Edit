import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260824025958_whatsapp_command_acceptance_executor.sql", import.meta.url), "utf8");
const readiness = readFileSync(new URL("../app/app/readiness/page.tsx", import.meta.url), "utf8");

test("command acceptance is bound to an armed verified recipient", () => {
  assert.match(migration, /scenario_key = 'commands_handoff'/);
  assert.match(migration, /status in \('armed','running'\)/);
  assert.match(migration, /recipient_hash = extensions\.digest\(normalized_address, 'sha256'\)/);
  assert.match(migration, /expires_at > now\(\)/);
});

test("only actual concierge replies count as acceptance evidence", () => {
  assert.match(migration, /new\.direction <> 'outgoing'/);
  assert.match(migration, /new\.status->>'source'.*booking_concierge/);
  assert.match(migration, /opted out of omnirelay whatsapp messages/);
  assert.match(migration, /clinic booking and care messages are active again/);
  assert.match(migration, /automated concierge is now paused/);
});

test("the complete command cycle closes the existing leased gate", () => {
  for (const key of ["stop", "start", "menu", "handoff"]) assert.match(migration, new RegExp(`'${key}'`));
  assert.match(migration, /if observed_count = 4 then/);
  assert.match(migration, /private\.complete_whatsapp_acceptance_test/);
  assert.match(migration, /unique \(run_id, observation_key\)/);
});

test("observations remain tenant scoped and admin readable", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.whatsapp_acceptance_observations from anon, authenticated/);
  assert.match(migration, /private\.is_organization_member\(organization_id, 'admin'\)/);
  assert.match(readiness, /STOP, then START, then choose Human assistance/);
});
