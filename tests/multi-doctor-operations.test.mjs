import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const migration=readFileSync(new URL("../supabase/migrations/20260816003000_multi_doctor_bulk_roster.sql",import.meta.url),"utf8");
const importRoute=readFileSync(new URL("../app/api/clinic-operations/import/route.ts",import.meta.url),"utf8");
const rosterRoute=readFileSync(new URL("../app/api/clinic-operations/roster/route.ts",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../app/app/clinic-operations/workspace.tsx",import.meta.url),"utf8");

test("bulk doctor import is preview-first, bounded and atomic",()=>{
  assert.match(migration,/p_commit boolean default false/);
  assert.match(migration,/between 1 and 200/);
  assert.match(migration,/bulk import never overwrites an existing profile/);
  assert.match(migration,/if jsonb_array_length\(errors\) > 0 or not p_commit/);
  assert.match(migration,/private\.is_organization_member\(p_organization_id, 'admin'\)/);
  assert.match(importRoute,/doctor_bulk_import/);
});
test("doctor profile, chamber assignment and recurring availability reuse existing booking models",()=>{
  assert.match(migration,/insert into public\.booking_resources/);
  assert.match(migration,/insert into public\.provider_profiles/);
  assert.match(migration,/insert into public\.provider_location_assignments/);
  assert.match(migration,/insert into public\.availability_rules/);
  assert.match(migration,/insert into public\.provider_location_services/);
});
test("today roster is tenant scoped and reports booking density and patient flow",()=>{
  assert.match(rosterRoute,/eq\("organization_id",\s*organization\.id\)/);
  assert.match(rosterRoute,/capacity/);
  assert.match(rosterRoute,/inConsultation/);
  assert.match(workspace,/Today’s roster and live bookings/);
  assert.match(workspace,/window\.setInterval\([\s\S]*?loadRoster\(date\)[\s\S]*?30000/);
});
