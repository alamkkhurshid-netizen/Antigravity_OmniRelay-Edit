import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync("supabase/migrations/20260823101500_pilot_booking_automation_shadow.sql","utf8");

test("pilot observes booking events without sending a second patient message",()=>{
  assert.match(migration,/execution_mode'='observe' then 'succeeded'/i);
  assert.match(migration,/trigger_key in \('booking_confirmed','appointment_changed'\)/i);
  assert.match(migration,/oa\.service='whatsapp' and oa\.status='connected'/i);
  assert.match(migration,/after update of status,starts_at,location_id,resource_id/i);
  assert.doesNotMatch(migration,/insert into public\.messages|recipient_address|customer_phone/i);
});

test("pilot events are idempotent, tenant scoped and privacy safe",()=>{
  assert.match(migration,/on conflict \(organization_id,idempotency_key\) do nothing/i);
  assert.match(migration,/w\.organization_id=p_organization_id/i);
  assert.doesNotMatch(migration,/patient_name|customer_name|clinical_note/i);
  assert.match(migration,/revoke all on function private\.observe_pilot_appointment_automation/i);
});
