import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20260823200000_multi_doctor_acceptance_harness.sql",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/app/readiness/page.tsx",import.meta.url),"utf8");

test("multi-doctor acceptance is read-only tenant-bound and identity-free",()=>{
  assert.match(migration,/private\.is_organization_member\(p_organization_id,'member'\)/);
  assert.match(migration,/language plpgsql stable security definer/);
  assert.doesNotMatch(migration,/insert into|update public|delete from/);
  assert.doesNotMatch(migration,/patient_name|customer_phone|contact_address/);
  assert.match(migration,/revoke all on function public\.get_multi_doctor_booking_acceptance\(uuid\) from public,anon/);
});

test("acceptance covers routing safety and lifecycle dependencies",()=>{
  for(const key of ["department_routing","provider_resolution","any_available_doctor","booking_safety","payment_reschedule_cancel"])assert.match(migration,new RegExp(`'${key}'`));
  assert.match(migration,/c\.contype='x'/);
  assert.match(page,/MULTI-DOCTOR ACCEPTANCE/);
  assert.match(page,/never creates a patient, appointment, payment, or WhatsApp message/);
});
