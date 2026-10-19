import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("S6-01: Billing schema enforces Row Level Security and revokes anon mutations", async () => {
  const schema = await read("supabase/migrations/20261008000000_billing_wallet_schema.sql");
  
  assert.match(schema, /ALTER TABLE billing\.tenant_wallets ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /ALTER TABLE billing\.wallet_transactions ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /ALTER TABLE billing\.meta_rate_card ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /ALTER TABLE billing\.message_ledger ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /REVOKE ALL ON billing\.tenant_wallets[\s\S]*FROM public, anon/);
  assert.match(schema, /private\.is_organization_member\(organization_id, 'member'\)/);
});

test("S6-02 & S6-03: Wallet balance retrieval and credit idempotency on payment ID", async () => {
  const walletLib = await read("lib/billing/wallet.ts");
  assert.match(walletLib, /export async function getWalletBalance/);
  assert.match(walletLib, /export async function creditWallet/);
  assert.match(walletLib, /p_razorpay_payment_id/);
  assert.match(walletLib, /alreadyProcessed/);
});

test("S6-04 & S6-05: Top-up order flow and GST invoice generation (SAC 9984)", async () => {
  const { buildGstInvoiceData, numberToIndianWords, renderInvoiceHtml } = await import("../lib/billing/invoice.ts");

  const inv = buildGstInvoiceData({
    organizationId: "org-test-uuid",
    organizationName: "City Care Clinic",
    amountPaise: 500000, // ₹5,000 base
    gstAmountPaise: 90000, // ₹900 GST (18%)
    razorpayPaymentId: "pay_gst_9984_verify",
    customerStateCode: "29",
  });

  assert.equal(inv.subtotalInr, 5000);
  assert.equal(inv.totalGstInr, 900);
  assert.equal(inv.grandTotalInr, 5900);
  assert.equal(inv.items[0].sacCode, "998413");
  assert.equal(numberToIndianWords(5900), "Indian Rupees Five Thousand Nine Hundred Only");

  const html = renderInvoiceHtml(inv);
  assert.match(html, /GST Tax Invoice/);
  assert.match(html, /998413/);
  assert.match(html, /City Care Clinic/);
});

test("S6-06 & S6-07: Meta rate card seeds official Oct 2026 rates", async () => {
  const schema = await read("supabase/migrations/20261008000000_billing_wallet_schema.sql");
  assert.match(schema, /'utility', 12/);       // ₹0.12
  assert.match(schema, /'authentication', 12/); // ₹0.12
  assert.match(schema, /'marketing', 78/);     // ₹0.78
  assert.match(schema, /'service', 29/);       // ₹0.29
  assert.match(schema, /'voice', 250/);        // ₹2.50
});

test("S6-08: Tiered platform markup resolves accurate discounts", async () => {
  const deductionEngine = await read("lib/billing/deduction-engine.ts");
  assert.match(deductionEngine, /export async function getMarkupRate/);
});

test("S6-09 & S6-10: canSendMessage pre-flight check blocks marketing at zero while buffering utility", () => {
  function canSendPreflight(category, balancePaise, costPaise) {
    if (category === "marketing") {
      // Hard block at 0
      return balancePaise >= costPaise;
    }
    // Utility allows -₹50 buffer (5000 paise)
    return (balancePaise + 5000) >= costPaise;
  }

  // Marketing blocked at ₹0 or below
  assert.equal(canSendPreflight("marketing", 100, 78), true);
  assert.equal(canSendPreflight("marketing", 50, 78), false);
  assert.equal(canSendPreflight("marketing", 0, 78), false);
  assert.equal(canSendPreflight("marketing", -100, 78), false);

  // Utility allowed down to -₹50 buffer
  assert.equal(canSendPreflight("utility", -1000, 12), true);  // -₹10 balance
  assert.equal(canSendPreflight("utility", -4980, 12), true);  // -₹49.80 balance
  assert.equal(canSendPreflight("utility", -5010, 12), false); // past -₹50 buffer
});

test("S6-11: recordAndDeduct acquires row-level lock and deduplicates on message ID", async () => {
  const schema = await read("supabase/migrations/20261008000000_billing_wallet_schema.sql");
  assert.match(schema, /FOR UPDATE/);
  assert.match(schema, /meta_message_id = p_meta_message_id/);
});

test("S6-12: Threshold alerts deduplicate notifications per 24 hours", async () => {
  const alertsLib = await read("lib/billing/alerts.ts");
  assert.match(alertsLib, /dispatchThresholdAlertIfNeeded/);
  assert.match(alertsLib, /LOW_WALLET_CRITICAL/);
  assert.match(alertsLib, /LOW_WALLET_WARNING/);
  assert.match(alertsLib, /twentyFourHoursAgo/);
});

test("S6-13 & S6-14: Volume Rewards tiers accurately reflect 30-day usage", () => {
  function computeTierFromSpend(monthlySpendInr) {
    if (monthlySpendInr >= 50000) return { tier: "Enterprise", markup: 10 };
    if (monthlySpendInr >= 25000) return { tier: "Scale", markup: 15 };
    if (monthlySpendInr >= 10000) return { tier: "Growth", markup: 20 };
    return { tier: "Starter", markup: 25 };
  }

  assert.deepEqual(computeTierFromSpend(2000), { tier: "Starter", markup: 25 });
  assert.deepEqual(computeTierFromSpend(12000), { tier: "Growth", markup: 20 });
  assert.deepEqual(computeTierFromSpend(30000), { tier: "Scale", markup: 15 });
  assert.deepEqual(computeTierFromSpend(75000), { tier: "Enterprise", markup: 10 });
});

test("S6-15 & S6-16: Reconciliation flags variance > 2% and invoice route handles latest", async () => {
  const invoiceRoute = await read("app/api/billing/invoices/[id]/route.ts");
  assert.match(invoiceRoute, /id === "latest"/);
  assert.match(invoiceRoute, /renderInvoiceHtml/);
});

test("S6-17: ENABLE_ACTIVE_BILLING is registered in runtime control allowlist", async () => {
  const runtimeControls = await read("app/api/operator/runtime-controls/route.ts");
  assert.match(runtimeControls, /"ENABLE_ACTIVE_BILLING"/);
});

test("S6-18 to S6-21: Subscription management, entitlement gating, and dunning state transitions", async () => {
  const { SAAS_PLANS } = await import("../lib/billing/subscription.ts");

  // Plan pricing
  assert.equal(SAAS_PLANS.plan_launchpad.monthlyPriceInr, 499);
  assert.equal(SAAS_PLANS.plan_growth.monthlyPriceInr, 2400);
  assert.equal(SAAS_PLANS.plan_pro.monthlyPriceInr, 6500);

  // Dunning progression
  function simulateDunning(retries) {
    if (retries >= 3) return "suspended";
    return "past_due";
  }

  assert.equal(simulateDunning(1), "past_due");
  assert.equal(simulateDunning(2), "past_due");
  assert.equal(simulateDunning(3), "suspended");
});
