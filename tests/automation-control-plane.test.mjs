import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("automation workflows are tenant-scoped and administrator controlled", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260823074000_automation_control_plane.sql", root), "utf8");
  assert.match(migration, /alter table public\.automation_workflows enable row level security/i);
  assert.match(migration, /private\.is_organization_member\(organization_id, 'member'\)/i);
  assert.match(migration, /private\.is_organization_member\(organization_id, 'admin'\)/i);
  assert.match(migration, /revoke all on public\.automation_workflows, public\.automation_runs from anon/i);
});

test("automation execution ledger is idempotent, bounded and privacy-safe", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260823074000_automation_control_plane.sql", root), "utf8");
  assert.match(migration, /unique \(organization_id, idempotency_key\)/i);
  assert.match(migration, /max_attempts integer not null default 3 check \(max_attempts between 1 and 10\)/i);
  assert.match(migration, /timeout_seconds integer not null default 30 check \(timeout_seconds between 5 and 300\)/i);
  assert.match(migration, /safe_context jsonb not null default '\{\}'::jsonb/i);
  assert.doesNotMatch(migration, /patient_name|phone|clinical_note/i);
});
