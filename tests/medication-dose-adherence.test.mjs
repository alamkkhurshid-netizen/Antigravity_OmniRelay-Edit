import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("doctor-issued medication schedules auto-authorize each independent dose", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260809200000_medication_dose_adherence.sql", root), "utf8");
  assert.match(migration, /approval_mode in \('manual', 'automatic'\)/i);
  assert.match(migration, /authorize_prescription_medication_schedule/i);
  assert.match(migration, /when d\.approval_mode = 'automatic' then 'approved'/i);
  assert.match(migration, /when not d\.consent_snapshot then 'skipped'/i);
});

test("patients can record medication outcomes through the approved reminder template", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260809200000_medication_dose_adherence.sql", root), "utf8");
  const worker = await readFile(new URL("supabase/functions/care-reminder-dispatch/index.ts", root), "utf8");
  assert.match(migration, /'confirmed', 'missed', 'snoozed', 'help'/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /Patient snoozed reminder for 15 minutes/i);
  assert.match(worker, /event_type", run\.reminder\.reminder_type === "follow_up" \? "follow_up" : "care_reminder"/);
  assert.match(worker, /organization\?\.name \|\| "Your clinic"/);
  assert.match(worker, /run\.reminder\.title \|\| run\.reminder\.instructions/);
});

test("clinic dashboard exposes a tenant-scoped 30-day adherence summary", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260809200000_medication_dose_adherence.sql", root), "utf8");
  const page = await readFile(new URL("app/app/automations/page.tsx", root), "utf8");
  const ui = await readFile(new URL("app/app/automations/care-reminder-workspace.tsx", root), "utf8");
  assert.match(migration, /view public\.patient_medication_adherence/i);
  assert.match(migration, /security_invoker = true/i);
  assert.match(page, /patient_medication_adherence/i);
  assert.match(ui, /30-DAY MEDICATION ADHERENCE/i);
});
