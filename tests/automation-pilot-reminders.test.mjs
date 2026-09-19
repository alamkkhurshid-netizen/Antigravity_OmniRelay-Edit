import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync("supabase/migrations/20260823110000_pilot_reminder_queue_observation.sql","utf8");

test("reminder and doctor queue pilots remain observe only",()=>{
  for(const key of ["appointment_reminder","medication_reminder","follow_up_due","doctor_queue"]){
    assert.match(migration,new RegExp(`'${key}'`));
  }
  assert.match(migration,/jsonb_build_object\('execution_mode','observe','rollout','pilot_2'\)/i);
  assert.doesNotMatch(migration,/insert into public\.messages|recipient_address|patient_name|customer_phone/i);
});

test("pilot two observes durable source records with private trigger functions",()=>{
  for(const table of ["reminder_events","care_reminder_runs","doctor_queue_dispatches"]){
    assert.match(migration,new RegExp(`after insert on public\\.${table}`));
  }
  assert.match(migration,/where id=new\.reminder_id and organization_id=new\.organization_id/i);
  assert.equal((migration.match(/revoke all on function private\.observe_/gi)??[]).length,3);
});
