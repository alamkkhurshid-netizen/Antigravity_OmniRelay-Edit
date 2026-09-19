import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync("supabase/migrations/20260823093000_connect_automation_triggers.sql","utf8");

test("clinic lifecycle adapters are registered for staged activation",()=>{
  for(const trigger of ["booking_created","booking_confirmed","appointment_changed","medication_reminder","follow_up_due","emergency_notice","doctor_queue"]){
    assert.match(migration,new RegExp(`'${trigger}'`));
  }
  assert.match(migration,/on conflict \(organization_id,idempotency_key\) do nothing/i);
  assert.match(migration,/where w\.organization_id=p_organization_id/i);
  assert.match(migration,/x\.trigger_key,'paused'/i);
});

test("automation event context excludes direct patient identity",()=>{
  assert.doesNotMatch(migration,/patient_name|customer_name|customer_phone|recipient_address|clinical_note/i);
  assert.match(migration,/security definer set search_path=''/i);
  assert.match(migration,/revoke all on function private\.enqueue_automation_event/i);
});
