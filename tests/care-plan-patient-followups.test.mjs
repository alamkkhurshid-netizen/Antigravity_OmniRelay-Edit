import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("care plan follow-ups reuse the consent-controlled reminder engine", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260809124500_care_plan_patient_followups.sql", root), "utf8");
  const route = await readFile(new URL("app/api/patients/care-plans/route.ts", root), "utf8");
  assert.match(migration, /care_plan_id uuid references public\.patient_care_plans\(id\) on delete cascade/i);
  assert.match(migration, /create unique index if not exists care_reminders_care_plan_idx/i);
  assert.match(route, /schedulePatientReminder/);
  assert.match(route, /Patient care consent and a mobile number are required for WhatsApp follow-up/);
  assert.match(route, /\.from\("care_reminders"\)\.insert/);
  assert.match(route, /reminder_type: "care"/);
});

test("care plan state and terminal delivery failures have operational follow-through", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260809124500_care_plan_patient_followups.sql", root), "utf8");
  const ui = await readFile(new URL("app/app/contacts/patient-directory.tsx", root), "utf8");
  assert.match(migration, /sync_care_plan_patient_reminder/);
  assert.match(migration, /escalate_failed_care_plan_reminder/);
  assert.match(migration, /new\.attempt_count < new\.max_attempts/);
  assert.match(migration, /priority = 'high'/);
  assert.match(ui, /Schedule WhatsApp follow-up at the review time/);
  assert.match(ui, /Consent is checked again before delivery/);
  assert.match(ui, /Patient WhatsApp:/);
});
