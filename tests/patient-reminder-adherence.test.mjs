import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("WhatsApp reminder replies create structured adherence outcomes and safe escalation", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260809190000_patient_reminder_adherence.sql", root), "utf8");
  assert.match(migration, /response_kind in \('confirmed','missed','help'\)/i);
  assert.match(migration, /capture_care_reminder_response/i);
  assert.match(migration, /new\.conversation_id/);
  assert.match(migration, /interval '48 hours'/);
  assert.match(migration, /patient_care_tasks/i);
  assert.match(migration, /'urgent'/i);
});

test("care reminder operations display patient responses and use the approved interactive template", async () => {
  const page = await readFile(new URL("app/app/automations/page.tsx", root), "utf8");
  const ui = await readFile(new URL("app/app/automations/care-reminder-workspace.tsx", root), "utf8");
  const worker = await readFile(new URL("supabase/functions/care-reminder-dispatch/index.ts", root), "utf8");
  assert.match(page, /response_kind,response_text,response_received_at/);
  assert.match(ui, /Patient requested help/);
  assert.match(ui, /need staff follow-up/);
  assert.match(worker, /"care_reminder"/);
  assert.match(worker, /organization\?\.name \|\| "Your clinic"/);
});
