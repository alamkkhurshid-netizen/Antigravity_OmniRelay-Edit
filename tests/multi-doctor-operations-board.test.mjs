import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const route=readFileSync(new URL("../app/api/clinic-operations/roster/route.ts",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../app/app/clinic-operations/workspace.tsx",import.meta.url),"utf8");

test("operations board keeps department and exception queries tenant scoped",()=>{
  assert.match(route,/from\("provider_departments"\)[\s\S]*?eq\("organization_id", organization\.id\)/);
  assert.match(route,/from\("schedule_exceptions"\)[\s\S]*?eq\("organization_id", organization\.id\)/);
  assert.match(route,/activeExceptions/);
  assert.doesNotMatch(route,/customer_name|customer_phone|patient_summary/);
});

test("operations board surfaces department density and actionable queue alerts",()=>{
  assert.match(workspace,/All departments/);
  assert.match(workspace,/Department and doctor booking density/);
  assert.match(workspace,/Roster and queue exceptions/);
  assert.match(workspace,/row\.exceptions/);
  assert.match(route,/queue delivery failed/);
});
