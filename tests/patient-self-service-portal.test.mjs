import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);

test("portal exposes payment and redacted care-plan summaries", async () => {
  const sql=await readFile(new URL("supabase/migrations/20260809153000_patient_self_service_portal.sql",root),"utf8");
  assert.match(sql,/'payment_status',a\.payment_status/); assert.match(sql,/'care_plans'/);
  assert.match(sql,/organization_id=v_session\.organization_id/); assert.match(sql,/patient_id=v_session\.patient_id/);
  assert.doesNotMatch(sql,/'instructions',cp\.instructions/); assert.doesNotMatch(sql,/'goal',cp\.goal/); assert.doesNotMatch(sql,/assigned_to/);
});

test("portal sign-out revokes the server session", async () => {
  const route=await readFile(new URL("app/api/patient/portal/route.ts",root),"utf8");
  const client=await readFile(new URL("app/patient/patient-portal.tsx",root),"utf8");
  assert.match(route,/export async function DELETE/); assert.match(route,/revoke_patient_portal_session/);
  assert.match(route,/httpOnly: true/); assert.match(client,/Sign out now/); assert.doesNotMatch(client,/access_token_hash/);
});

test("portal mutations remain session scoped", async () => {
  const sql=await readFile(new URL("supabase/migrations/20260808210000_security_hardening.sql",root),"utf8");
  assert.match(sql,/organization_id=v_session\.organization_id and patient_id=v_session\.patient_id/);
  assert.match(sql,/scope in \('bookings','all'\)/);
});
