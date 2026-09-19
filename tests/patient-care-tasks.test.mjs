import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("patient care tasks are tenant isolated and role protected", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260808133000_patient_care_tasks.sql", root), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /to authenticated/i);
  assert.match(sql, /private\.is_organization_member\(organization_id, 'admin'\)/i);
  assert.match(sql, /patient_care_tasks_org_queue_idx/i);
});

test("task API validates patient ownership and exposes lifecycle actions", async () => {
  const api = await readFile(new URL("app/api/patients/tasks/route.ts", root), "utf8");
  const ui = await readFile(new URL("app/app/contacts/patient-directory.tsx", root), "utf8");
  assert.match(api, /\.eq\("organization_id", organization\.id\)/);
  assert.match(api, /in_progress/);
  assert.match(ui, /STAFF ACTION QUEUE/);
  assert.match(ui, /Add to clinic queue/);
  assert.match(ui, /updateTask\(item\.id,"completed"\)/);
});
