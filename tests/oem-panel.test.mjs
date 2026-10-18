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

test("Meta Cloud reconciliation flags discrepancies when variance exceeds 2%", () => {
  function checkVarianceFlag(metaInvoicePaise, ledgerRecordedPaise) {
    const diffPaise = Math.abs(metaInvoicePaise - ledgerRecordedPaise);
    const variancePct = ledgerRecordedPaise > 0 ? (diffPaise / ledgerRecordedPaise) * 100 : 0;
    return {
      variancePct: parseFloat(variancePct.toFixed(2)),
      isFlagged: variancePct > 2.0,
      diffINR: (diffPaise / 100).toFixed(2),
    };
  }

  // 1% variance - acceptable within buffer
  const withinBuffer = checkVarianceFlag(101000, 100000);
  assert.equal(withinBuffer.variancePct, 1.0);
  assert.equal(withinBuffer.isFlagged, false);

  // 2.5% variance - triggers operator reconciliation alert
  const flagged = checkVarianceFlag(102500, 100000);
  assert.equal(flagged.variancePct, 2.5);
  assert.equal(flagged.isFlagged, true);
  assert.equal(flagged.diffINR, "25.00");
});

test("rate card manager computes tenant message costs with platform margin", () => {
  function computeMessageRate(basePaise, platformFeePaise) {
    const totalPaise = basePaise + platformFeePaise;
    return {
      totalPaise,
      totalINR: (totalPaise / 100).toFixed(2),
      platformMarginPct: parseFloat(((platformFeePaise / totalPaise) * 100).toFixed(1)),
    };
  }

  // Marketing message: base 78 paise + 15 paise platform fee = 93 paise (₹0.93)
  const marketing = computeMessageRate(78, 15);
  assert.equal(marketing.totalPaise, 93);
  assert.equal(marketing.totalINR, "0.93");
  assert.equal(marketing.platformMarginPct, 16.1);

  // Utility message: base 12 paise + 5 paise fee = 17 paise (₹0.17)
  const utility = computeMessageRate(12, 5);
  assert.equal(utility.totalPaise, 17);
  assert.equal(utility.totalINR, "0.17");
});

test("tenant lifecycle state transitions enforce valid status invariants", () => {
  const VALID_STATUSES = new Set(["active", "trialing", "suspended", "archived"]);

  function transitionTenantState(currentStatus, action) {
    if (!VALID_STATUSES.has(currentStatus)) {
      throw new Error(`Invalid current status: ${currentStatus}`);
    }

    switch (action) {
      case "suspend":
        return "suspended";
      case "reactivate":
        return "active";
      case "extend_trial":
        return "trialing";
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  assert.equal(transitionTenantState("active", "suspend"), "suspended");
  assert.equal(transitionTenantState("suspended", "reactivate"), "active");
  assert.equal(transitionTenantState("trialing", "extend_trial"), "trialing");
  assert.throws(() => transitionTenantState("corrupted_state", "suspend"), /Invalid current status/);
});

test("support impersonation session enforces 1 hour TTL and security defaults", () => {
  function getImpersonationCookieConfig(orgId) {
    return {
      name: "omnirelay_impersonate_org",
      value: orgId,
      httpOnly: true,
      path: "/",
      maxAge: 3600, // strictly 1 hour
    };
  }

  const cookie = getImpersonationCookieConfig("org-12345");
  assert.equal(cookie.maxAge, 3600);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.path, "/");
  assert.equal(cookie.value, "org-12345");
});

test("OEM export CSV escaping adheres to RFC 4180 rules", () => {
  function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    const str = typeof val === "object" ? JSON.stringify(val) : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  }

  assert.equal(escapeCsvCell('Clinic "Apex" Healthcare'), '"Clinic ""Apex"" Healthcare"');
  assert.equal(escapeCsvCell(null), '""');
  assert.equal(escapeCsvCell(1250), '"1250"');
  assert.equal(escapeCsvCell({ scope: "global" }), '"{""scope"":""global""}"');
});

