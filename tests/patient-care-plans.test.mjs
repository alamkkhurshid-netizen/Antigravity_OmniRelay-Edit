import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("structured care plans are tenant isolated and role protected", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260808230000_structured_patient_care_plans.sql", root), "utf8");
  assert.match(sql, /alter table public\.patient_care_plans enable row level security/i);
  assert.match(sql, /private\.is_organization_member\(organization_id, 'admin'\)/i);
  assert.match(sql, /with check \(private\.is_organization_member\(organization_id, 'admin'\)\)/i);
  assert.match(sql, /revoke all on public\.patient_care_plans from anon/i);
  assert.match(sql, /target_date is null or target_date >= starts_on/i);
});

test("care-plan API validates tenant links, assignees and administrator access", async () => {
  const route = await readFile(new URL("app/api/patients/care-plans/route.ts", root), "utf8");
  assert.match(route, /Only a workspace owner or administrator can create a care plan/);
  assert.match(route, /The selected encounter does not belong to this patient/);
  assert.match(route, /The assignee is not an active clinic team member/);
  assert.match(route, /\.eq\("organization_id", organization\.id\)/);
});

test("patient CRM supports care-plan creation, assignment and lifecycle controls", async () => {
  const ui = await readFile(new URL("app/app/contacts/patient-directory.tsx", root), "utf8");
  assert.match(ui, /STRUCTURED CARE PLANS/);
  assert.match(ui, /Assign to/);
  assert.match(ui, /Next review/);
  assert.match(ui, /updateCarePlan\(item\.id,"paused"\)/);
  assert.match(ui, /updateCarePlan\(item\.id,"completed"\)/);
});

test("dated care plans synchronize a traceable clinic review task", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260809113000_sync_care_plan_review_tasks.sql", root), "utf8");
  const route = await readFile(new URL("app/api/patients/care-plans/route.ts", root), "utf8");
  const ui = await readFile(new URL("app/app/contacts/patient-directory.tsx", root), "utf8");
  assert.match(sql, /care_plan_id uuid references public\.patient_care_plans\(id\) on delete cascade/i);
  assert.match(sql, /create unique index patient_care_tasks_care_plan_idx/i);
  assert.match(sql, /create trigger sync_care_plan_review_task/i);
  assert.match(sql, /new\.status = 'active' and new\.next_review_at is not null/i);
  assert.match(sql, /new\.status in \('paused', 'cancelled'\)/i);
  assert.match(route, /reviewTask: reviewTask \?\? null/);
  assert.match(ui, /Care plan activated and its review task added to the clinic queue/);
});
