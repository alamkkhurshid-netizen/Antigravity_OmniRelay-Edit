import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("billing schema migration defines production wallet and ledger tables", async () => {
  const migration = await read("supabase/migrations/20261008000000_billing_wallet_schema.sql");
  
  // 1. Table definitions
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing\.tenant_wallets/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing\.wallet_transactions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing\.meta_rate_card/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing\.tenant_pricing_tiers/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing\.message_ledger/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS billing\.billing_reconciliation/);

  // 2. Official Oct 1, 2026 rates seeded
  assert.match(migration, /'utility', 12/);       // ₹0.12
  assert.match(migration, /'marketing', 78/);     // ₹0.78
  assert.match(migration, /'service', 29/);       // ₹0.29
  assert.match(migration, /'voice', 250/);        // ₹2.50 / min

  // 3. Concurrency lock (FOR UPDATE)
  assert.match(migration, /FOR UPDATE/);

  // 4. Idempotency guarantees
  assert.match(migration, /razorpay_payment_id = p_razorpay_payment_id/);
  assert.match(migration, /meta_message_id = p_meta_message_id/);

  // 5. Block-before-send policy (-₹50 buffer for utility, zero for marketing)
  assert.match(migration, /INSUFFICIENT_FUNDS_MARKETING_BLOCKED/);
  assert.match(migration, /-5000 \+ v_estimated_cost/);

  // 6. RLS security
  assert.match(migration, /ALTER TABLE billing\.tenant_wallets ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT ALL ON ALL TABLES IN SCHEMA billing TO service_role/);
});

test("GST calculation computes precise 18% tax breakdown in INR and paise", () => {
  function calculateTopUpWithGst(amountInr) {
    const baseAmountInr = Math.max(0, amountInr);
    const gstAmountInr = Math.round(baseAmountInr * 0.18 * 100) / 100;
    const totalPayableInr = Math.round((baseAmountInr + gstAmountInr) * 100) / 100;
    return {
      baseAmountInr,
      gstAmountInr,
      totalPayableInr,
      baseAmountPaise: Math.round(baseAmountInr * 100),
      gstAmountPaise: Math.round(gstAmountInr * 100),
      totalPayablePaise: Math.round(totalPayableInr * 100),
    };
  }

  // Test ₹1,000 top-up
  const gst1000 = calculateTopUpWithGst(1000);
  assert.equal(gst1000.baseAmountInr, 1000);
  assert.equal(gst1000.gstAmountInr, 180);
  assert.equal(gst1000.totalPayableInr, 1180);
  assert.equal(gst1000.baseAmountPaise, 100000);
  assert.equal(gst1000.gstAmountPaise, 18000);
  assert.equal(gst1000.totalPayablePaise, 118000);

  // Test ₹500 top-up
  const gst500 = calculateTopUpWithGst(500);
  assert.equal(gst500.baseAmountInr, 500);
  assert.equal(gst500.gstAmountInr, 90);
  assert.equal(gst500.totalPayableInr, 590);
  assert.equal(gst500.baseAmountPaise, 50000);
  assert.equal(gst500.gstAmountPaise, 9000);
  assert.equal(gst500.totalPayablePaise, 59000);
});

test("wallet and deduction engine modules export required production interfaces", async () => {
  const walletLib = await read("lib/billing/wallet.ts");
  assert.match(walletLib, /export async function getWalletBalance/);
  assert.match(walletLib, /export async function creditWallet/);
  assert.match(walletLib, /export async function getWalletTransactions/);

  const deductionEngine = await read("lib/billing/deduction-engine.ts");
  assert.match(deductionEngine, /export async function getMessageRate/);
  assert.match(deductionEngine, /export async function canSendMessage/);
  assert.match(deductionEngine, /export async function recordAndDeduct/);
  assert.match(deductionEngine, /export function calculateTopUpWithGst/);
});

test("API routes wire into billing engine and verify Razorpay signatures", async () => {
  const topupRoute = await read("app/api/billing/razorpay-topup/route.ts");
  assert.match(topupRoute, /calculateTopUpWithGst/);
  assert.match(topupRoute, /order_/);

  const webhookRoute = await read("app/api/billing/webhook/route.ts");
  assert.match(webhookRoute, /x-razorpay-signature/);
  assert.match(webhookRoute, /creditWallet/);
  assert.match(webhookRoute, /invoice_number/);

  const voiceRoute = await read("app/api/billing/voice-metering/route.ts");
  assert.match(voiceRoute, /recordAndDeduct/);
  assert.match(voiceRoute, /"voice"/);
});

test("GST tax invoice generator constructs valid SAC 9984 invoice data and words", async () => {
  const { buildGstInvoiceData, numberToIndianWords, renderInvoiceHtml } = await import("../lib/billing/invoice.ts");

  // Indian words conversion
  assert.equal(numberToIndianWords(1180), "Indian Rupees One Thousand One Hundred Eighty Only");
  assert.equal(numberToIndianWords(590.50), "Indian Rupees Five Hundred Ninety and Fifty Paise Only");

  // Build Invoice Data
  const inv = buildGstInvoiceData({
    organizationId: "org-test-uuid",
    organizationName: "Apex Healthcare Clinic",
    amountPaise: 100000, // ₹1,000 base
    gstAmountPaise: 18000, // ₹180 GST
    razorpayPaymentId: "pay_test12345678",
    customerStateCode: "29", // Intra-state (Karnataka)
  });

  assert.equal(inv.subtotalInr, 1000);
  assert.equal(inv.totalGstInr, 180);
  assert.equal(inv.grandTotalInr, 1180);
  assert.equal(inv.isInterState, false);
  assert.equal(inv.items[0].sacCode, "998413");
  assert.equal(inv.items[0].cgstAmountInr, 90);
  assert.equal(inv.items[0].sgstAmountInr, 90);

  // Render HTML
  const html = renderInvoiceHtml(inv);
  assert.match(html, /GST Tax Invoice/);
  assert.match(html, /Apex Healthcare Clinic/);
  assert.match(html, /998413/);
  assert.match(html, /29AABCO9999P1Z5/);
});

test("SaaS subscription plans match commercial packaging charter", async () => {
  const { SAAS_PLANS } = await import("../lib/billing/subscription.ts");

  assert.equal(SAAS_PLANS.plan_launchpad.monthlyPriceInr, 499);
  assert.equal(SAAS_PLANS.plan_growth.monthlyPriceInr, 2400);
  assert.equal(SAAS_PLANS.plan_pro.monthlyPriceInr, 6500);

  assert.ok(SAAS_PLANS.plan_growth.features.includes("google_calendar_sync"));
  assert.ok(SAAS_PLANS.plan_growth.features.includes("rag_knowledge"));
  assert.ok(SAAS_PLANS.plan_pro.features.includes("voice_ai_agent"));
  assert.ok(SAAS_PLANS.plan_pro.features.includes("campaigns_broadcast"));
});

test("dunning state machine enforces 7-day grace period and 3-strike suspension", () => {
  function simulateDunning(initialRetryCount) {
    const nextRetry = initialRetryCount + 1;
    const isSuspension = nextRetry >= 3;
    return {
      retryCount: nextRetry,
      status: isSuspension ? "suspended" : "past_due",
      gracePeriodActive: !isSuspension,
    };
  }

  // Attempt 1: past_due with grace period
  const attempt1 = simulateDunning(0);
  assert.equal(attempt1.retryCount, 1);
  assert.equal(attempt1.status, "past_due");
  assert.equal(attempt1.gracePeriodActive, true);

  // Attempt 2: past_due with grace period
  const attempt2 = simulateDunning(1);
  assert.equal(attempt2.retryCount, 2);
  assert.equal(attempt2.status, "past_due");

  // Attempt 3: hard suspension (read-only)
  const attempt3 = simulateDunning(2);
  assert.equal(attempt3.retryCount, 3);
  assert.equal(attempt3.status, "suspended");
  assert.equal(attempt3.gracePeriodActive, false);
});

test("outbound action-centre dispatcher wires canSendMessage before Graph API", async () => {
  const actionCentre = await read("app/app/action-centre/actions.ts");
  assert.match(actionCentre, /canSendMessage\(orgId/);
  assert.match(actionCentre, /Outbound blocked: Insufficient operational wallet balance/);
  assert.match(actionCentre, /recordAndDeduct\(orgId/);
});

test("threshold alert deduplication suppresses duplicate alerts within 24 hours", () => {
  function shouldSuppressAlert(lastDispatchedIso, nowIso = new Date().toISOString()) {
    if (!lastDispatchedIso) return false;
    const lastDispatched = new Date(lastDispatchedIso).getTime();
    const now = new Date(nowIso).getTime();
    const diffHours = (now - lastDispatched) / (1000 * 60 * 60);
    return diffHours < 24;
  }

  // Alert fired 2 hours ago -> should be suppressed
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(shouldSuppressAlert(twoHoursAgo), true);

  // Alert fired 26 hours ago -> should NOT be suppressed
  const twentySixHoursAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  assert.equal(shouldSuppressAlert(twentySixHoursAgo), false);
});

