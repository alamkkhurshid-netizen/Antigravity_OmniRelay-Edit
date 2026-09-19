import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260824030715_abandoned_booking_recovery_executor.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/readiness/channel-test/route.ts", import.meta.url), "utf8");
const readiness = readFileSync(new URL("../app/app/readiness/page.tsx", import.meta.url), "utf8");

test("recovery preparation is delivery verified and idle-session only", () => {
  assert.match(migration, /m\.status \? 'delivered'/);
  assert.match(migration, /timestamp >= now\(\) - interval '30 days'/);
  assert.match(migration, /target_session\.state <> 'welcome'/);
  assert.match(migration, /state = 'welcome'/);
});

test("recovery fixture contains no patient identity and creates no clinical record", () => {
  assert.doesNotMatch(migration, /patient_id|patient_name|phone/);
  assert.doesNotMatch(migration, /insert into public\.appointments/i);
  assert.doesNotMatch(migration, /insert into public\.patient_profiles/i);
  assert.match(migration, /previous_expires_at/);
});

test("only the real expired-session response closes the gate", () => {
  assert.match(migration, /previous booking session expired/);
  assert.match(migration, /lower\(trim\(coalesce\(m\.content->>'text', ''\)\)\) = 'menu'/);
  assert.match(migration, /recipient_hash = extensions\.digest\(normalized_address, 'sha256'\)/);
  assert.match(migration, /private\.complete_whatsapp_acceptance_test/);
});

test("recovery preparation and evidence remain protected", () => {
  assert.match(migration, /revoke all on function public\.prepare_abandoned_recovery_acceptance\(uuid\)[\s\S]*public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.prepare_abandoned_recovery_acceptance\(uuid\)[\s\S]*to service_role/i);
  assert.match(migration, /enable row level security/);
  assert.match(route, /prepare_abandoned_recovery_acceptance/);
  assert.match(readiness, /no appointment or patient record is created/i);
});
