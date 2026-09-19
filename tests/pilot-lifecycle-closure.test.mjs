import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("../app/app/readiness/readiness-workspace.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/readiness/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/app/readiness/page.tsx", import.meta.url), "utf8");

test("Phase 1 pilot closure records each clinic lifecycle handoff", () => {
  for (const key of ["pilot_booking", "pilot_care_plan", "pilot_follow_up", "pilot_reminder", "pilot_signoff"]) {
    assert.match(workspace, new RegExp(key));
    assert.match(route, new RegExp(key));
  }
  assert.match(page, /Phase 1 closure direction/);
});

test("pilot evidence guidance excludes patient identity and clinical detail", () => {
  assert.match(workspace, /never a patient or clinical detail/);
  assert.doesNotMatch(workspace, /patient_name|customer_phone|prescription_text/i);
});

test("readiness exposes only aggregate evidence for a linked patient lifecycle", () => {
  assert.match(page, /closedJourneyPatients/);
  assert.match(page, /reminderOutcomes/);
  assert.match(workspace, /No patient name, phone number, diagnosis, or reminder content is shown here/);
  assert.match(workspace, /AUTOMATIC LIFECYCLE EVIDENCE/);
});
