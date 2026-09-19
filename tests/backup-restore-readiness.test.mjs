import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("restore runbook forbids production drills and covers separate storage recovery", async () => {
  const runbook = await readFile(new URL("docs/operations/BACKUP_RESTORE_RUNBOOK.md", root), "utf8");
  assert.match(runbook, /practice restore must never target production/i);
  assert.match(runbook, /Storage metadata, not the binary objects/i);
  assert.match(runbook, /encrypted, off-site logical backup/i);
  assert.match(runbook, /85 SQL files are present/);
  assert.match(runbook, /172 migrations/);
  assert.match(runbook, /missing pre-July-2026 baseline/i);
});

test("recovery verification SQL is metadata-only and read-only", async () => {
  const sql = await readFile(new URL("scripts/verify-recovery-readiness.sql", root), "utf8");
  assert.match(sql, /begin read only/i);
  assert.match(sql, /pg_class/);
  assert.match(sql, /pg_policies/);
  assert.match(sql, /supabase_migrations\.schema_migrations/);
  assert.match(sql, /rollback/i);
  assert.doesNotMatch(sql, /from\s+public\./i);
  assert.doesNotMatch(sql, /from\s+storage\.objects/i);
  assert.doesNotMatch(sql, /select\s+\*/i);
});

test("drill checklist contains healthcare-specific containment gates", async () => {
  const checklist = await readFile(new URL("docs/operations/RESTORE_DRILL_CHECKLIST.md", root), "utf8");
  assert.match(checklist, /No production project reference/);
  assert.match(checklist, /Synthetic or expressly authorized data only/);
  assert.match(checklist, /Outbound WhatsApp, email and payment effects are disabled/);
  assert.match(checklist, /Cross-tenant isolation/);
  assert.match(checklist, /Private Storage isolation/);
});

test("backup command encrypts outside the repository and never persists plaintext", async () => {
  const script = await readFile(new URL("scripts/create-supabase-backup.sh", root), "utf8");
  assert.match(script, /umask 077/);
  assert.match(script, /OMNIRELAY_DATABASE_URL/);
  assert.match(script, /OMNIRELAY_BACKUP_AGE_RECIPIENT/);
  assert.match(script, /Backup destination must be outside the application repository/);
  assert.match(script, /supabase db dump/);
  assert.match(script, /--role-only/);
  assert.match(script, /--data-only/);
  assert.match(script, /public\.medicine_catalog_entries/);
  assert.match(script, /OMNIRELAY_MEDICINE_CATALOG_SOURCE_PACKAGE/);
  assert.match(script, /medicine_catalog_entries_in_data_sql=false/);
  assert.match(script, /age -r/);
  assert.match(script, /sha256sum/);
  assert.match(script, /trap cleanup EXIT INT TERM/);
  assert.doesNotMatch(script, /echo .*DATABASE_URL/);
  assert.doesNotMatch(script, /service_role/i);
});

test("backup artifacts cannot enter source control", async () => {
  const ignore = await readFile(new URL(".gitignore", root), "utf8");
  assert.match(ignore, /^\/backups\/$/m);
  assert.match(ignore, /^\*\.backup\.age$/m);
  assert.match(ignore, /^\*\.backup\.sha256$/m);
});

test("Windows pilot backup is encrypted, external and secret-prompted", async () => {
  const script = await readFile(new URL("scripts/Create-OmniRelayBackup.ps1", root), "utf8");
  assert.match(script, /Read-Host .* -AsSecureString/);
  assert.match(script, /Backup destination must be outside the OmniRelay application folder/);
  assert.match(script, /supabase db dump/);
  assert.match(script, /--role-only/);
  assert.match(script, /--data-only/);
  assert.match(script, /public\.medicine_catalog_entries/);
  assert.match(script, /MedicineCatalogSourcePackage/);
  assert.match(script, /medicine_catalog_entries_in_data_sql=false/);
  assert.match(script, /age -r \$AgeRecipient/);
  assert.match(script, /Get-FileHash -Algorithm SHA256/);
  assert.match(script, /Remove-Item -LiteralPath \$workDirectory -Recurse -Force/);
  assert.doesNotMatch(script, /service_role/i);
  assert.doesNotMatch(script, /Set-Content[^\n]+databaseUrl/i);
});

test("free Windows procedure keeps paid recovery features deferred", async () => {
  const guide = await readFile(new URL("docs/operations/FREE_BACKUP_WINDOWS.md", root), "utf8");
  assert.match(guide, /zero-subscription path/i);
  assert.match(guide, /does not enable Supabase Pro, PITR or paid cloud storage/i);
  assert.match(guide, /Keep two encrypted copies/);
  assert.match(guide, /Storage metadata but not uploaded file bytes/);
  assert.match(guide, /isolated restore drill passes/);
  assert.match(guide, /medicine_catalog_entries/);
  assert.match(guide, /MedicineCatalogSourcePackage/);
});
