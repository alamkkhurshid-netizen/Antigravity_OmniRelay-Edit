import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("emergency audience includes disruption and operational appointment states", async () => {
  const [route, workspace] = await Promise.all([
    readFile(new URL("app/api/campaigns/route.ts", root), "utf8"),
    readFile(new URL("app/app/campaigns/campaign-workspace.tsx", root), "utf8"),
  ]);
  for (const source of [route, workspace]) {
    assert.match(source, /payment_pending/);
    assert.match(source, /rescheduling_required/);
    assert.doesNotMatch(source, /"rescheduled"/);
  }
  assert.match(route, /patient-safe message/);
  assert.match(workspace, /affected-appointment safeguards/);
});

test("emergency notices require a doctor-specific scope before sending", async () => {
  const worker = await readFile(new URL("supabase/functions/campaign-dispatch/index.ts", root), "utf8");
  assert.match(worker, /audience_filter/);
  assert.match(worker, /c\.campaign_type==="emergency"/);
  assert.match(worker, /Doctor-specific emergency audience scope is incomplete/);
  assert.match(worker, /Patient is no longer affected by this doctor-specific emergency/);
  assert.match(worker, /Affected doctor could not be verified before sending/);
  assert.match(worker, /doctorLabel\(resource\.name\)/);
  assert.match(worker, /templateContext/);
  assert.match(worker, /\.eq\("location_id",locationId\)/);
  assert.match(worker, /\.eq\("resource_id",resourceId\)/);
  assert.match(worker, /\.eq\("patient_id",r\.patient_id\)/);
});

test("emergency creation scopes one doctor, preserves arrived visits and retains human exceptions", async () => {
  const [route, workspace, actionCentre, migration] = await Promise.all([
    readFile(new URL("app/api/campaigns/route.ts", root), "utf8"),
    readFile(new URL("app/app/campaigns/campaign-workspace.tsx", root), "utf8"),
    readFile(new URL("app/app/action-centre/workspace.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/20260912044009_doctor_specific_emergency_notices.sql", root), "utf8"),
  ]);
  assert.match(route, /b\.resourceId/);
  assert.match(route, /reschedule_required/);
  assert.match(route, /status!=="arrived"/);
  assert.match(route, /Emergency contact required/);
  assert.match(workspace, /Doctor-specific emergency only/);
  assert.match(workspace, /Patient message preview/);
  assert.match(workspace, /resource_id===f\.resourceId/);
  assert.match(actionCentre, /Emergency notice needs manual contact/);
  assert.match(migration, /campaigns_emergency_doctor_scope_check/);
  assert.match(migration, /resource_id/);
});
