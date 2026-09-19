import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("manual automation recovery is tenant-scoped, audited and throttled", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260809223000_durable_automation_recovery.sql", root), "utf8");
  assert.match(sql, /alter table public\.automation_recovery_events enable row level security/i);
  assert.match(sql, /private\.is_organization_member\(p_organization_id, 'admin'\)/i);
  assert.match(sql, /recent_recoveries >= 20/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /p_job_kind = 'appointment_reminder'/i);
  assert.match(sql, /update public\.care_reminder_runs/i);
  assert.match(sql, /insert into public\.automation_recovery_events/i);
  assert.match(sql, /revoke all on function public\.retry_failed_automation_job/i);
});

test("operations recovery is server mediated and exposes no privileged key", async () => {
  const route = await readFile(new URL("app/api/operations/retry/route.ts", root), "utf8");
  const ui = await readFile(new URL("app/app/operations/recovery-actions.tsx", root), "utf8");
  const page = await readFile(new URL("app/app/operations/page.tsx", root), "utf8");
  assert.match(route, /getWorkspace\(\)/);
  assert.match(route, /retry_failed_automation_job/);
  assert.doesNotMatch(route + ui, /SUPABASE_SECRET_KEY|service_role|sb_secret_/i);
  assert.match(ui, /Review & retry/);
  assert.match(ui, /Recent recovery decisions/);
  assert.match(ui, /No exhausted jobs awaiting review/);
  assert.match(page, /recoveries=\{recoveries \?\? \[\]\}/);
  assert.match(page, /Dead-letter review|RecoveryActions/);
});
