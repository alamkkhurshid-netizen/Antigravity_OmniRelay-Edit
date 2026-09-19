import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const web=readFileSync(new URL("../app/book/[slug]/booking-concierge.tsx",import.meta.url),"utf8");
const whatsapp=readFileSync(new URL("../supabase/functions/whatsapp-booking-concierge/index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20260823190000_public_department_booking_contract.sql",import.meta.url),"utf8");

test("public booking catalogue exposes only safe department routing metadata",()=>{
  assert.match(migration,/'clinic_mode'/);
  assert.match(migration,/'departments'/);
  assert.match(migration,/'provider_departments'/);
  assert.doesNotMatch(migration,/contact_phone|contact_email/);
});

test("web booking resolves any-provider slots to a real provider",()=>{
  assert.match(web,/Any available doctor/);
  assert.match(web,/resource_id:item\.providerId/);
  assert.match(web,/const resolvedResourceId=slot&&anyProvider/);
  assert.match(web,/p_resource_id:resolvedResourceId/);
});

test("WhatsApp booking adds department routing without changing solo flow",()=>{
  assert.match(whatsapp,/profile\?\.clinic_mode==="multi_doctor_clinic"/);
  assert.match(whatsapp,/update\("department",context\)/);
  assert.match(whatsapp,/id:"any_provider"/);
  assert.match(whatsapp,/context\.resource=context\.resources\?\.find/);
});
