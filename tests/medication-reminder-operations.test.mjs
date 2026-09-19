import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("medication reminder operations surface prescription context and exceptions", async () => {
  const workspace = await readFile(new URL("app/app/automations/care-reminder-workspace.tsx", root), "utf8");
  const shell = await readFile(new URL("components/app-shell.tsx", root), "utf8");
  assert.match(shell, /Care reminders/);
  assert.match(workspace, /MEDICATION & FOLLOW-UP OPERATIONS/);
  assert.match(workspace, /Search patient or medicine/);
  assert.match(workspace, /consent blocked/);
  assert.match(workspace, /delivery failed/);
  assert.match(workspace, /prescription_number/);
  assert.match(workspace, /medicine_name/);
});

test("reminder creation remains doctor-defined and consent gated", async () => {
  const route = await readFile(new URL("app/api/care-reminders/route.ts", root), "utf8");
  assert.match(route, /care_communications_consent/);
  assert.match(route, /prescriptionItemId/);
  assert.match(route, /medicine does not belong to the selected prescription/i);
  assert.doesNotMatch(route, /recommend|suggest.*medicine|generate.*dosage/i);
});
