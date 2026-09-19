import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("completed bounded acceptance tests remain valid closure evidence", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260910013000_reconcile_controlled_acceptance_evidence.sql", root), "utf8");
  for (const scenario of ["deposit_payment", "commands_handoff", "abandoned_recovery"]) {
    assert.match(migration, new RegExp(`scenario_key='${scenario}' and r.status='passed'`));
  }
  assert.match(migration, /reminder_count>0 and commands_test_ok/);
  assert.match(migration, /revoke all on function private\.run_whatsapp_booking_acceptance_closure\(uuid\) from public,anon,authenticated/);
});
