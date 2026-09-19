import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20260811122003_protect_public_booking_mutations.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("public booking protection covers the shared appointment insert boundary", () => {
  assert.match(sql, /before insert on public\.appointments/);
  assert.match(sql, /new\.source is distinct from 'web'/);
  assert.match(sql, /new\.status not in \('confirmed', 'payment_pending'\)/);
});

test("trusted service and internal workflows retain their booking path", () => {
  assert.match(sql, /caller_role is null or caller_role = 'service_role'/);
});

test("limiter stores pseudonymous contact identities with bounded windows", () => {
  assert.match(sql, /extensions\.hmac/);
  assert.match(sql, /private\.normalize_phone_identity/);
  assert.match(sql, /'public_booking_contact'/);
  assert.match(sql, /current_hits > 5/);
  assert.match(sql, /'public_booking_organization'/);
  assert.match(sql, /current_hits > 60/);
  assert.doesNotMatch(sql, /insert into private\.api_rate_limits[\s\S]*customer_phone/);
});

test("rate-limit rows receive bounded retention", () => {
  assert.match(sql, /cleanup-api-rate-limits/);
  assert.match(sql, /updated_at < now\(\) - interval '7 days'/);
});
