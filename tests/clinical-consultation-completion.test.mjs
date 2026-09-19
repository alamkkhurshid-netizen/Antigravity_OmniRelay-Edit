import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("appointment completion requires an atomic clinical record", async () => {
  const [manager, migration, page] = await Promise.all([
    read("app/app/appointments/appointment-manager.tsx"),
    read("supabase/migrations/20260810062614_complete_appointment_patient_lifecycle.sql"),
    read("app/app/appointments/page.tsx"),
  ]);
  assert.match(manager, /complete_appointment_visit/);
  assert.match(manager, /Complete & document/);
  assert.match(manager, /Clinical note <em>required<\/em>/);
  assert.match(page, /id,patient_id,resource_id/);
  assert.match(migration, /for update/);
  assert.match(migration, /insert into public\.patient_encounters/);
  assert.match(migration, /update_appointment_status\(p_organization_id\s*,\s*p_appointment_id\s*,\s*'completed'\)/);
  assert.match(migration, /insert into public\.patient_care_tasks/);
  assert.match(migration, /set_appointment_follow_up/);
  assert.doesNotMatch(manager, /must be linked to a patient before it can be completed/);
});

test("clinical completion guards duplicate and unlinked visits", async () => {
  const migration = await read("supabase/migrations/20260810062614_complete_appointment_patient_lifecycle.sql");
  assert.match(migration, /Patient identity could not be resolved/i);
  assert.match(migration, /on conflict \(appointment_id\)/i);
  assert.match(migration, /Follow-up must be scheduled in the future/);
});
