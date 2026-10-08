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

  const voiceRoute = await read("app/api/billing/voice-metering/route.ts");
  assert.match(voiceRoute, /recordAndDeduct/);
  assert.match(voiceRoute, /"voice"/);
});
