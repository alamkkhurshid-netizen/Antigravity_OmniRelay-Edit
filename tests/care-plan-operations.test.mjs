import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("care plan operations board exposes clinic-wide review and reminder controls", async () => {
  const page = await readFile(new URL("app/app/care-plans/page.tsx", root), "utf8");
  const ui = await readFile(new URL("app/app/care-plans/care-plan-operations.tsx", root), "utf8");
  const shell = await readFile(new URL("components/app-shell.tsx", root), "utf8");
  assert.match(page, /patient_care_plans/);
  assert.match(page, /care_reminders/);
  assert.match(page, /patient_care_tasks/);
  assert.match(ui, /Due in 7 days/);
  assert.match(ui, /Reminder issues/);
  assert.match(ui, /Needs attention/);
  assert.match(ui, /\/api\/patients\/care-plans/);
  assert.match(shell, /\/app\/care-plans/);
});
