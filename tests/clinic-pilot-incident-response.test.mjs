import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);

test("security incidents are tenant scoped, admin controlled and append-only audited", async()=>{
  const sql=await readFile(new URL("supabase/migrations/20260815150000_clinic_pilot_incident_response.sql",root),"utf8");
  const grants=await readFile(new URL("supabase/migrations/20260815151000_revoke_incident_delete_access.sql",root),"utf8");
  assert.match(sql,/alter table public\.security_incidents enable row level security/i);
  assert.match(sql,/private\.is_organization_member\(organization_id, 'admin'\)/i);
  assert.match(sql,/revoke all on public\.security_incident_events from public, anon, authenticated/i);
  assert.match(sql,/after insert or update on public\.security_incidents/i);
  assert.match(sql,/revoke all on function private\.audit_security_incident_change\(\) from public, anon, authenticated/i);
  assert.match(sql,/raise exception 'immutable incident identity'/i);
  assert.match(sql,/incident owner must be an active organization member/i);
  assert.doesNotMatch(sql,/grant delete on public\.security_incidents/i);
  assert.match(grants,/revoke all on public\.security_incidents from authenticated/i);
  assert.match(grants,/grant select, insert, update on public\.security_incidents to authenticated/i);
  assert.match(grants,/revoke delete, truncate, references, trigger/i);
});

test("incident API is authenticated, organization bound, validated and throttled",async()=>{
  const route=await readFile(new URL("app/api/operations/incidents/route.ts",root),"utf8");
  assert.match(route,/supabase\.auth\.getUser\(\)/);
  assert.match(route,/organization_id: organization\.id/);
  assert.match(route,/\.eq\("organization_id", organization\.id\)/);
  assert.match(route,/incident_create/);
  assert.match(route,/incident_update/);
  assert.match(route,/Resolution summary is required/);
});

test("operations UI keeps incident descriptions privacy safe",async()=>{
  const ui=await readFile(new URL("app/app/operations/incident-control.tsx",root),"utf8");
  assert.match(ui,/without patient names, phone numbers or medical content/i);
  assert.match(ui,/Open and assign to me/);
  assert.match(ui,/Contain/);
  assert.match(ui,/Monitor/);
  assert.match(ui,/Resolve/);
});
