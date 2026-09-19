import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260824084940_booking_insert_observation_reconciliation.sql",
  "utf8",
);

test("confirmed appointment inserts enter the observe-only booking ledger", () => {
  assert.match(migration, /after insert on public\.appointments/i);
  assert.match(migration, /'booking_confirmed'/);
  assert.match(migration, /'source_id', new\.id/);
  assert.match(migration, /revoke all on function private\.observe_pilot_appointment_insert/);
});

test("historical evidence requires a delivered WhatsApp booking handoff", () => {
  assert.match(migration, /private\.whatsapp_booking_handoffs/);
  assert.match(migration, /m\.status->>'handoff_id' = h\.id::text/);
  assert.match(migration, /m\.status \? 'delivered'/);
  assert.match(migration, /'evidence', 'delivered_booking_handoff'/);
  assert.match(migration, /on conflict \(organization_id, idempotency_key\) do update/);
});
