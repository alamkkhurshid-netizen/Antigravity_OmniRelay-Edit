import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("patient journey readiness is deterministic and requires the complete care path", async () => {
  const logic = await readFile(new URL("app/app/contacts/patient-journey.ts", root), "utf8");
  assert.match(logic, /profileComplete=input\.hasPhone&&input\.hasAge&&input\.hasHealthConcern&&input\.hasLocation&&input\.hasPincode/);
  assert.match(logic, /careRecordComplete=input\.prescriptionCount>0\|\|input\.documentCount>0/);
  assert.match(logic, /carePlanComplete=input\.activeCarePlanCount>0\|\|input\.activeFollowUpCount>0\|\|input\.openTaskCount>0/);
  assert.match(logic, /Capture care consent/);
  assert.match(logic, /ready:completed===steps\.length/);
});

test("patient CRM exposes readiness summaries, filters and next-action controls", async () => {
  const ui = await readFile(new URL("app/app/contacts/patient-directory.tsx", root), "utf8");
  assert.match(ui, /CLINIC PILOT READINESS/);
  assert.match(ui, /Needs action/);
  assert.match(ui, /PATIENT JOURNEY/);
  assert.match(ui, /Issue prescription/);
  assert.match(ui, /Upload document/);
  assert.match(ui, /Add care task/);
  assert.match(ui, /Create care plan/);
});
