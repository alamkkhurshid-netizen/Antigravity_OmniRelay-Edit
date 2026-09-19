import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20260823220000_priority_alert_escalation.sql",import.meta.url),"utf8");
const api=readFileSync(new URL("../app/api/notifications/route.ts",import.meta.url),"utf8");
const shell=readFileSync(new URL("../components/app-shell.tsx",import.meta.url),"utf8");

test("priority alert materialization is tenant bound deduplicated and privacy safe",()=>{
  assert.match(migration,/private\.is_organization_member\(p_organization_id,'member'\)/);
  assert.match(migration,/not exists\(select 1 from public\.app_notifications/);
  assert.doesNotMatch(migration,/patient_name|customer_name|customer_phone|full_name/);
  assert.match(migration,/never sends patient messages or exposes identity/);
  assert.match(migration,/revoke all on function public\.refresh_priority_action_alerts\(uuid\) from public,anon/);
});

test("alerts cover approvals disruptions delivery failures and overdue follow-ups",()=>{
  for(const source of ["whatsapp_booking_requests","schedule_exceptions","reminder_events","patient_care_tasks"])assert.match(migration,new RegExp(`public\\.${source}`));
  assert.match(migration,/interval '15 minutes'/);
  assert.match(migration,/interval '24 hours'/);
  assert.match(api,/refresh_priority_action_alerts/);
  assert.match(api,/order\("escalation_level"/);
  assert.match(shell,/ACTION NEEDS ATTENTION/);
});
