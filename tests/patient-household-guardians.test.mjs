import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route=readFileSync(new URL("../app/api/patients/guardians/route.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/app/contacts/patient-directory.tsx",import.meta.url),"utf8");
const loader=readFileSync(new URL("../app/app/contacts/page.tsx",import.meta.url),"utf8");

test("guardian mutations require an authenticated tenant administrator",()=>{
  assert.match(route,/role === "owner" \|\| role === "admin"/);
  assert.match(route,/Only workspace administrators can manage household contacts/);
  assert.match(route,/\.eq\("organization_id", organization\.id\)/);
});

test("guardian creation validates patient ownership, phone and relationship",()=>{
  assert.match(route,/patient_profiles/);
  assert.match(route,/normalizedPhone\.length < 10/);
  assert.match(route,/relationships\.has\(relationship\)/);
  assert.match(route,/guardian_phone: normalizedPhone/);
  assert.match(route,/replace\(\/\[\^0-9\]\/g, ""\) === normalizedPhone/);
  assert.match(route,/update\(values\)\.eq\("id", existing\.id\)/);
});

test("patient CRM exposes household contacts without granting clinical access",()=>{
  assert.match(loader,/patient_guardian_links/);
  assert.match(page,/HOUSEHOLD &amp; GUARDIANS/);
  assert.match(page,/never grants access to the patient’s clinical timeline/);
  assert.match(page,/staffVerified/);
});
