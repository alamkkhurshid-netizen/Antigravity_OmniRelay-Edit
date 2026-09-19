import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("operational wallet is constrained to shadow mode by default", async () => {
  const migration = await read("supabase/migrations/20260912230000_operational_wallet_shadow_foundation.sql");
  assert.match(migration, /mode text not null default 'shadow'/);
  assert.match(migration, /charging_enabled boolean not null default false/);
  assert.match(migration, /send_blocking_enabled boolean not null default false/);
  assert.match(migration, /mode = 'active' or \(charging_enabled = false and send_blocking_enabled = false/);
  assert.match(migration, /revoke all on public\.operational_billing_settings, public\.operational_wallets/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /Shadow usage intentionally writes no wallet ledger and never checks balance/);
});

test("billing workspace describes estimated pilot usage without enabling charges", async () => {
  const page = await read("app/app/billing/operational-wallet.tsx");
  assert.match(page, /Usage pilot — no clinic is being charged/);
  assert.match(page, /send blocking remain disabled/);
  assert.match(page, /Rate card pending/);
  assert.match(page, /router\.refresh\(\)/);
});

test("release knowledge record documents the operational-wallet boundary", async () => {
  const record = await read("docs/knowledge/releases/2026-09-12-operational-wallet-shadow-foundation.md");
  assert.match(record, /shadow mode/i);
  assert.match(record, /one-clinic monthly reconciliation/i);
});
