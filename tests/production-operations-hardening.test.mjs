import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("operations tables and rate limits are tenant safe", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260808190000_production_operations_hardening.sql", root), "utf8");
  assert.match(sql, /alter table public\.team_audit_events enable row level security/i);
  assert.match(sql, /alter table public\.operational_events enable row level security/i);
  assert.match(sql, /revoke all on private\.api_rate_limits from public, anon, authenticated/i);
  assert.match(sql, /actor uuid := \(select auth\.uid\(\)\)/i);
  assert.match(sql, /p_bucket not in \('team_invite','team_role_change','team_deactivate','team_reactivate'\)/i);
});

test("high-risk authenticated operations are rate limited", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260808200000_durable_reminder_leases.sql", root), "utf8");
  const billing = await readFile(new URL("app/api/billing/order/route.ts", root), "utf8");
  const conversation = await readFile(new URL("app/api/conversations/start/route.ts", root), "utf8");
  assert.match(migration, /'billing_order','conversation_start'/);
  assert.match(billing, /consumeRateLimit\(supabase,"billing_order",10,3600\)/);
  assert.match(conversation, /consumeRateLimit\(supabase, "conversation_start", 20, 3600\)/);
});

test("reminder workers use recoverable atomic leases", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260808200000_durable_reminder_leases.sql", root), "utf8");
  const appointment = await readFile(new URL("supabase/functions/appointment-reminder-dispatch/index.ts", root), "utf8");
  const care = await readFile(new URL("supabase/functions/care-reminder-dispatch/index.ts", root), "utf8");
  assert.match(migration, /create or replace function public\.claim_due_care_reminder_runs/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /last_attempt_at < now\(\) - interval '10 minutes'/);
  assert.match(care, /rpc\("claim_due_care_reminder_runs"/);
  assert.match(care, /\.eq\("status", "processing"\)/);
  assert.match(care, /omnirelay_dispatch_key/);
  assert.match(appointment, /omnirelay_dispatch_key/);
  assert.match(care, /contains\("status", \{ omnirelay_dispatch_key: dispatchKey \}\)/);
  assert.match(appointment, /contains\("status", \{ omnirelay_dispatch_key: dispatchKey \}\)/);
  assert.doesNotMatch(care, /data:\s*\{[^}]*omnirelay_dispatch_key/s);
  assert.doesNotMatch(appointment, /data:\s*\{[^}]*omnirelay_dispatch_key/s);
  assert.match(appointment, /get_public_site_url/);
  assert.match(appointment, /PUBLIC_SITE_URL is required/);
  assert.doesNotMatch(appointment, /chatgpt\.site/);
});

test("public site URL is stored in Vault and exposed only to service role", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260808203000_public_site_runtime_config.sql", root), "utf8");
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /revoke all on function public\.get_public_site_url\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_public_site_url\(\) to service_role/);
});

test("disabled staff immediately lose organization authorization", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260808190000_production_operations_hardening.sql", root), "utf8");
  const disabledChecks = sql.match(/coalesce\([^\n]+status[^\n]+active[^\n]+\) = 'active'/g) ?? [];
  assert.ok(disabledChecks.length >= 2, "both organization authorization functions must reject disabled members");
});

test("team removal is reversible, audited and server mediated", async () => {
  const route = await readFile(new URL("app/api/team/members/route.ts", root), "utf8");
  const ui = await readFile(new URL("app/app/team/team-operations.tsx", root), "utf8");
  assert.doesNotMatch(route, /\.delete\(\)/);
  assert.match(route, /status: "disabled"/);
  assert.match(route, /createAdminClient\(\)/);
  assert.match(route, /recordTeamAudit/);
  assert.match(route, /recordOperationalError/);
  assert.match(ui, /Reactivate/);
  assert.match(ui, /Recent team changes/);
  assert.match(ui, /OPERATIONS HEALTH/);
});
