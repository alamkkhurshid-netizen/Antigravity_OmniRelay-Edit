import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "supabase/migrations/20260824100304_managed_booking_handoff_reconciliation.sql",
  "utf8",
);
const runner = fs.readFileSync("supabase/functions/automation-runner/index.ts", "utf8");

test("managed booking reconciliation prefers the existing WhatsApp handoff", () => {
  assert.match(migration, /private\.whatsapp_booking_handoffs/);
  assert.match(migration, /m\.status->>'handoff_id' = h\.id::text/);
  assert.match(migration, /p_appointment_id/);
  assert.match(migration, /revoke all on function public\.get_existing_booking_confirmation/);
});

test("runner completes from the existing message and never dispatches another", () => {
  assert.match(runner, /get_existing_booking_confirmation/);
  assert.match(runner, /p_observed_message_id: confirmation\.message_id/);
  assert.doesNotMatch(runner, /send|dispatch_booking_confirmation/);
});
