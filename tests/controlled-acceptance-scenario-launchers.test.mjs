import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260824025232_controlled_acceptance_scenario_launchers.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/readiness/channel-test/route.ts", import.meta.url), "utf8");
const controls = readFileSync(new URL("../app/app/readiness/channel-test-controls.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/app/readiness/page.tsx", import.meta.url), "utf8");

test("scenario launcher is service-only and delivery-bound", () => {
  assert.match(migration, /p_scenario_key not in \('commands_handoff', 'abandoned_recovery'\)/);
  assert.match(migration, /m\.status \? 'delivered'/);
  assert.match(migration, /timestamp >= now\(\) - interval '30 days'/);
  assert.match(migration, /revoke all on function public\.prepare_whatsapp_acceptance_scenario\(uuid, text\)[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});

test("each scenario has a strict message ceiling", () => {
  assert.match(migration, /when 'commands_handoff' then 3/);
  assert.match(migration, /when 'abandoned_recovery' then 1/);
});

test("preparation requires an administrator and a rate limit", () => {
  assert.match(route, /\["owner", "admin"\]\.includes\(role\)/);
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /No message has been sent yet|prepare_whatsapp_acceptance_scenario/);
});

test("readiness controls distinguish preparation from dispatch", () => {
  assert.match(controls, /does not send a message/i);
  assert.match(controls, /30-minute test lease/i);
  assert.match(page, /Maximum three controlled messages/i);
  assert.match(page, /Maximum one controlled recovery message/i);
});
