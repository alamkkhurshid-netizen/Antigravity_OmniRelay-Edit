import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20260823180000_multi_doctor_department_foundation.sql",import.meta.url),"utf8");
const form=readFileSync(new URL("../app/app/settings/workspace-form.tsx",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/app/settings/page.tsx",import.meta.url),"utf8");

test("clinic mode explicitly separates solo and multi-doctor booking",()=>{
  assert.match(migration,/clinic_mode text not null default 'solo_practitioner'/i);
  assert.match(migration,/multi_doctor_clinic/);
  assert.match(form,/Solo mode bypasses department and doctor selection/);
});

test("departments and provider assignments are tenant safe",()=>{
  assert.match(migration,/foreign key\(department_id,organization_id\)/i);
  assert.match(migration,/foreign key\(resource_id,organization_id\)/i);
  assert.match(migration,/private\.is_organization_member\(organization_id,'admin'\)/i);
  assert.match(migration,/alter table public\.clinic_departments enable row level security/i);
  assert.match(migration,/alter table public\.provider_departments enable row level security/i);
});

test("settings configures departments and each provider primary department",()=>{
  assert.match(page,/from\("clinic_departments"\)/);
  assert.match(page,/from\("provider_departments"\)/);
  assert.match(form,/Departments and specialties/);
  assert.match(form,/Primary department/);
  assert.match(form,/providerDepartmentMap/);
});
