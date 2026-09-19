import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260808223000_atomic_prescription_issuance.sql",
  import.meta.url,
);
const routePath = new URL("../app/api/patients/prescriptions/route.ts", import.meta.url);
const directoryPath = new URL("../app/app/contacts/patient-directory.tsx", import.meta.url);

test("prescription issuance is a single tenant-guarded database transaction", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function public\.issue_clinical_prescription/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /private\.is_organization_member\(p_organization_id, 'admin'\)/i);
  assert.match(sql, /insert into public\.prescriptions/i);
  assert.match(sql, /insert into public\.prescription_items/i);
  assert.match(sql, /insert into public\.care_reminders/i);
  assert.match(sql, /grant execute .* to authenticated/i);
  assert.match(sql, /revoke all .* from public, anon/i);
});

test("the API delegates all clinical writes to the atomic RPC", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /\.rpc\("issue_clinical_prescription"/);
  assert.doesNotMatch(route, /\.from\("prescriptions"\)\s*\n\s*\.insert/);
  assert.doesNotMatch(route, /\.from\("prescription_items"\)\s*\n\s*\.insert/);
  assert.doesNotMatch(route, /\.from\("care_reminders"\)\.insert/);
});

test("staff receive an immediate printable-prescription handoff", async () => {
  const directory = await readFile(directoryPath, "utf8");
  assert.match(directory, /issuedPrescriptionId/);
  assert.match(directory, /View \/ print prescription/);
  assert.match(directory, /\/app\/prescriptions\/\$\{issuedPrescriptionId\}/);
});
