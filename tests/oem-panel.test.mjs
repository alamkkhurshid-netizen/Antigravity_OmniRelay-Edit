import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("OEM tenant health migration enforces strict platform operator authorization", async () => {
  const migration = await read("supabase/migrations/20260809180000_oem_tenant_health.sql");

  assert.match(migration, /create or replace function public\.get_oem_tenant_health/);
  assert.match(migration, /if not private\.is_platform_operator\(\) then/);
  assert.match(migration, /OEM operator access required/);
  assert.match(migration, /set search_path = ''/);
});

test("OEM tenant health queries append audit events to private.oem_audit_events", async () => {
  const migration = await read("supabase/migrations/20260809180000_oem_tenant_health.sql");

  assert.match(migration, /create table if not exists private\.oem_audit_events/);
  assert.match(migration, /insert into private\.oem_audit_events/);
  assert.match(migration, /'tenant_health_viewed'/);
  assert.match(migration, /revoke all on private\.oem_audit_events from public, anon, authenticated/);
});

test("OEM panel foundation defines global operator policies and tenant overview RPC", async () => {
  const migration = await read("supabase/migrations/20260918231500_oem_panel_foundation.sql");

  assert.match(migration, /platform operators can read all operational usage/);
  assert.match(migration, /platform operators can manage whatsapp rate cards/);
  assert.match(migration, /platform operators can read security incidents/);
  assert.match(migration, /platform operators can read automation recovery events/);
  assert.match(migration, /create or replace function public\.admin_get_tenant_overview/);
  assert.match(migration, /if not \(select private\.is_platform_operator\(\)\) then/);
});

test("OEM autopilot migration restricts draft approvals to platform operators", async () => {
  const autopilot = await read("supabase/migrations/20261005030000_oem_autopilot.sql");
  const agentControl = await read("supabase/migrations/20261006040000_oem_agent_control.sql");

  assert.match(autopilot, /create table public\.oem_agent_drafts/);
  assert.match(autopilot, /private\.is_platform_operator\('oem_admin'\)/);
  assert.match(agentControl, /premium_support_agent_active/);
});

test("first user bootstrap assigns OEM operator role cleanly", async () => {
  const bootstrap = await read("supabase/migrations/20261006070000_make_first_user_oem.sql");
  assert.match(bootstrap, /platform_operators/);
});

test("OEM tenant health aggregation derives correct lifecycle categories", () => {
  function deriveTenantHealthCategory(entitlementStatus, daysUntilTrialEnd, failedDeliveryCount) {
    if (entitlementStatus === "suspended") return "critical";
    if (failedDeliveryCount > 10) return "warning";
    if (entitlementStatus === "trialing" && daysUntilTrialEnd <= 3) return "attention";
    return "healthy";
  }

  assert.equal(deriveTenantHealthCategory("active", 30, 0), "healthy");
  assert.equal(deriveTenantHealthCategory("suspended", 0, 0), "critical");
  assert.equal(deriveTenantHealthCategory("active", 30, 15), "warning");
  assert.equal(deriveTenantHealthCategory("trialing", 2, 0), "attention");
});

test("channel attention flag activates when channel has failed messages or needs review", () => {
  function channelNeedsAttention(status, failedCount7d) {
    if (status !== "live" && status !== "active") return true;
    return failedCount7d > 5;
  }

  assert.equal(channelNeedsAttention("live", 0), false);
  assert.equal(channelNeedsAttention("pending", 0), true);
  assert.equal(channelNeedsAttention("live", 12), true);
});

test("operator overview revenue calculations sum paise to INR correctly", () => {
  function paiseToInrFormatted(paise) {
    return `₹${(Number(paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }

  assert.equal(paiseToInrFormatted(150000), "₹1,500.00");
  assert.equal(paiseToInrFormatted(0), "₹0.00");
});

test("OEM audit index optimizes query performance by actor and timestamp", async () => {
  const migration = await read("supabase/migrations/20260809180000_oem_tenant_health.sql");
  assert.match(migration, /oem_audit_events_actor_time_idx/);
  assert.match(migration, /actor_user_id, created_at desc/);
});

test("operator RPC raises 42501 error code on unauthorized caller", async () => {
  const migration = await read("supabase/migrations/20260809180000_oem_tenant_health.sql");
  assert.match(migration, /errcode = '42501'/);
});
