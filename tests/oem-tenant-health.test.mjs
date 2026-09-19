import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260809180000_oem_tenant_health.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../app/oem/page.tsx", import.meta.url), "utf8");

test("OEM tenant health is operator-gated and aggregate-only", () => {
  assert.match(migration, /private\.is_platform_operator\(\)/);
  assert.match(migration, /aggregate_only/);
  assert.doesNotMatch(migration, /customer_phone|customer_email|contact_address/);
});

test("OEM health reads are privately audited", () => {
  assert.match(migration, /private\.oem_audit_events/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on private\.oem_audit_events from public, anon, authenticated/);
  assert.match(migration, /tenant_health_viewed/);
});

test("OEM UI surfaces adoption and channel exceptions without impersonation", () => {
  assert.match(page, /Workspace health/);
  assert.match(page, /appointments/);
  assert.match(page, /failed deliveries/);
  assert.match(page, /Support impersonation is not enabled/);
});
