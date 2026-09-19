import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20260823210000_action_centre_ownership.sql",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/app/action-centre/page.tsx",import.meta.url),"utf8");
const ui=readFileSync(new URL("../app/app/action-centre/workspace.tsx",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/action-centre/ownership/route.ts",import.meta.url),"utf8");

test("action ownership is tenant scoped and coordination only",()=>{
  assert.match(migration,/private\.is_organization_member\(organization_id,'admin'\)/);
  assert.match(migration,/assigned_to=auth\.uid\(\)/);
  assert.match(migration,/Coordination-only ownership/);
  assert.doesNotMatch(route,/from\("appointments"\)|from\("patient_profiles"\)|delete\(/);
  assert.match(route,/organization_id:organization\.id/);
});

test("action centre prioritizes approvals disruptions waitlists and failures",()=>{
  assert.match(page,/from\("appointment_waitlist"\)/);
  assert.match(page,/from\("schedule_exceptions"\)/);
  assert.match(ui,/\.sort\(\(a,b\)=>b\.rank-a\.rank\)/);
  assert.match(ui,/Booking approval required/);
  assert.match(ui,/Waitlist follow-up/);
  assert.match(ui,/schedule_disruption/);
  assert.match(ui,/Owned by you/);
});

test("overdue follow-ups must be visibly claimed before staff action",()=>{
  assert.match(ui,/Overdue follow-up/);
  assert.match(ui,/Claim follow-up/);
  assert.match(ui,/Start follow-up/);
  assert.match(ui,/coordinate\(item,"release"\)/);
  assert.match(ui,/claimedByYou&&<button/);
  assert.match(route,/"care_task"/);
});
