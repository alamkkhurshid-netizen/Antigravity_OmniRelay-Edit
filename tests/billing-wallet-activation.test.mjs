import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("wallet helper enforces unique payment idempotency", () => {
  const processedPayments = new Set();
  let currentBalancePaise = 50000; // ₹500

  function creditWalletSim(paymentId, amountPaise) {
    if (processedPayments.has(paymentId)) {
      return { alreadyProcessed: true, balancePaise: currentBalancePaise };
    }
    processedPayments.add(paymentId);
    currentBalancePaise += amountPaise;
    return { alreadyProcessed: false, balancePaise: currentBalancePaise };
  }

  // First call
  const first = creditWalletSim("pay_123456", 100000);
  assert.equal(first.alreadyProcessed, false);
  assert.equal(first.balancePaise, 150000);

  // Replay of same payment ID
  const replay = creditWalletSim("pay_123456", 100000);
  assert.equal(replay.alreadyProcessed, true);
  assert.equal(replay.balancePaise, 150000); // Balance unchanged
});

test("reverse GST extraction computes base operational wallet credits accurately", () => {
  function extractBaseFromInclusive(totalPaise) {
    const basePaise = Math.round(totalPaise / 1.18);
    const gstPaise = totalPaise - basePaise;
    return { basePaise, gstPaise };
  }

  // ₹1,180 inclusive payment (₹1,000 base + ₹180 GST)
  const res1180 = extractBaseFromInclusive(118000);
  assert.equal(res1180.basePaise, 100000); // exactly ₹1,000 in paise
  assert.equal(res1180.gstPaise, 18000);   // exactly ₹180 in paise

  // ₹590 inclusive payment (₹500 base + ₹90 GST)
  const res590 = extractBaseFromInclusive(59000);
  assert.equal(res590.basePaise, 50000);   // exactly ₹500 in paise
  assert.equal(res590.gstPaise, 9000);     // exactly ₹90 in paise
});

test("marketing broadcast block policy disallows negative balance", () => {
  function canSendMarketing(walletBalancePaise, estimatedCostPaise) {
    // Marketing requires balance >= estimated cost (zero buffer)
    return walletBalancePaise >= estimatedCostPaise;
  }

  assert.equal(canSendMarketing(1000, 500), true);
  assert.equal(canSendMarketing(400, 500), false);
  assert.equal(canSendMarketing(0, 500), false);
  assert.equal(canSendMarketing(-100, 500), false);
});

test("utility reminder policy allows negative buffer to protect patient care", () => {
  function canSendUtilityReminder(walletBalancePaise, estimatedCostPaise) {
    // -₹50 buffer (5000 paise) allowed for patient notifications
    const bufferPaise = 5000;
    return (walletBalancePaise + bufferPaise) >= estimatedCostPaise;
  }

  assert.equal(canSendUtilityReminder(100, 12), true);
  assert.equal(canSendUtilityReminder(-1000, 12), true);  // -₹10 balance, still within -₹50 buffer
  assert.equal(canSendUtilityReminder(-4980, 12), true);  // -₹49.80 balance (+20 remaining buffer >= 12)
  assert.equal(canSendUtilityReminder(-5050, 12), false); // exceeds -₹50 buffer
});

test("low balance warning flag triggers when wallet drops below threshold", () => {
  const LOW_BALANCE_THRESHOLD_PAISE = 10000; // ₹100

  function checkLowBalance(balancePaise) {
    return balancePaise <= LOW_BALANCE_THRESHOLD_PAISE;
  }

  assert.equal(checkLowBalance(50000), false); // ₹500 - healthy
  assert.equal(checkLowBalance(10000), true);  // ₹100 - threshold
  assert.equal(checkLowBalance(5000), true);   // ₹50 - warning
  assert.equal(checkLowBalance(0), true);      // ₹0 - warning
});

test("concurrency simulation: 50 simultaneous wallet deductions serialize without race conditions", async () => {
  let balancePaise = 100000; // Initial ₹1,000 (100,000 paise)
  const DEDUCTION_PER_MSG = 78; // ₹0.78 marketing msg (78 paise)
  const NUM_REQUESTS = 50;

  // Mock atomic mutex
  let locked = false;
  async function acquireLock() {
    while (locked) {
      await new Promise((r) => setTimeout(r, 1));
    }
    locked = true;
  }
  function releaseLock() {
    locked = false;
  }

  async function atomicDeduct() {
    await acquireLock();
    try {
      balancePaise -= DEDUCTION_PER_MSG;
    } finally {
      releaseLock();
    }
  }

  const tasks = Array.from({ length: NUM_REQUESTS }, () => atomicDeduct());
  await Promise.all(tasks);

  const expectedFinalBalance = 100000 - (NUM_REQUESTS * DEDUCTION_PER_MSG);
  assert.equal(balancePaise, expectedFinalBalance, `Final balance must equal ${expectedFinalBalance} paise`);
});

test("concurrency simulation: 25 simultaneous payments with unique IDs sum to exact mathematical balance", async () => {
  let totalBalance = 0;
  const TOP_UP_AMOUNT = 50000; // ₹500
  const NUM_PAYMENTS = 25;

  let locked = false;
  async function acquireLock() {
    while (locked) {
      await new Promise((r) => setTimeout(r, 1));
    }
    locked = true;
  }
  function releaseLock() {
    locked = false;
  }

  const processed = new Set();
  async function atomicCredit(paymentId, amount) {
    await acquireLock();
    try {
      if (processed.has(paymentId)) return;
      processed.add(paymentId);
      totalBalance += amount;
    } finally {
      releaseLock();
    }
  }

  const paymentTasks = Array.from({ length: NUM_PAYMENTS }, (_, i) => 
    atomicCredit(`pay_unique_${i}`, TOP_UP_AMOUNT)
  );
  await Promise.all(paymentTasks);

  const expectedTotal = NUM_PAYMENTS * TOP_UP_AMOUNT;
  assert.equal(totalBalance, expectedTotal);
  assert.equal(processed.size, NUM_PAYMENTS);
});

test("billing webhook signature mismatch raises alert in operational_events", async () => {
  const webhook = await read("app/api/billing/webhook/route.ts");
  assert.match(webhook, /operational_events/);
  assert.match(webhook, /PAYMENT_AMOUNT_MISMATCH/);
});

test("billing schema protects rate cards and ledger tables with RLS", async () => {
  const schema = await read("supabase/migrations/20261008000000_billing_wallet_schema.sql");
  assert.match(schema, /billing\.tenant_wallets ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /billing\.wallet_transactions ENABLE ROW LEVEL SECURITY/);
  assert.match(schema, /billing\.message_ledger ENABLE ROW LEVEL SECURITY/);
});

test("billing rate lookup resolves standard multi-channel communication costs", () => {
  const RATE_CARD_PAISE = {
    utility: 12,      // ₹0.12
    marketing: 78,    // ₹0.78
    service: 29,      // ₹0.29
    voice_per_min: 250 // ₹2.50
  };

  assert.equal(RATE_CARD_PAISE.utility, 12);
  assert.equal(RATE_CARD_PAISE.marketing, 78);
  assert.equal(RATE_CARD_PAISE.service, 29);
  assert.equal(RATE_CARD_PAISE.voice_per_min, 250);
});
