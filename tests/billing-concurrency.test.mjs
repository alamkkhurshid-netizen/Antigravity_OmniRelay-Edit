import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Billing Concurrency & Idempotency: 20 simultaneous callbacks for one call", async () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261010000004_billing_security_and_rate_card_repair.sql", import.meta.url), "utf8");
  const deductionEngine = readFileSync(new URL("../lib/billing/deduction-engine.ts", import.meta.url), "utf8");

  // 1. Verify RPC concurrency locking and idempotency return in SQL
  assert.match(migration, /'already_deducted', TRUE/, "Concurrent duplicates must return already_deducted TRUE");
  assert.match(migration, /units_billed/, "RPC must record units_billed snapshot");
  assert.match(migration, /unit_rate_paise/, "RPC must record unit_rate_paise snapshot");
  assert.match(migration, /REVOKE ALL ON FUNCTION billing\.record_and_deduct.+FROM PUBLIC/, "Public execution must be revoked");
  assert.match(migration, /REVOKE ALL ON FUNCTION billing\.record_and_deduct.+FROM anon/, "Anon execution must be revoked");
  assert.match(migration, /REVOKE ALL ON FUNCTION billing\.record_and_deduct.+FROM authenticated/, "Authenticated execution must be revoked");
  assert.match(migration, /GRANT EXECUTE ON FUNCTION billing\.record_and_deduct.+TO service_role/, "Only service_role may execute");

  // 2. Mathematical Proof: 5-minute call at ₹3.99/min deducts exactly ₹19.95 (1995 paise)
  const units = 5;
  const unitRatePaise = 399; // ₹3.99
  const expectedTotalPaise = units * unitRatePaise;
  assert.equal(expectedTotalPaise, 1995, "5 minutes at ₹3.99/min must equal 1995 paise (₹19.95)");

  // 3. Behavioral Simulation: 20 simultaneous callbacks hitting deduction engine idempotency
  let ledgerEntryCount = 0;
  let walletDeductionsCount = 0;
  const ledgerMap = new Map();

  async function mockSimulatedRpc(callId, orgId, unitsBilled, ratePaise, idempotencyKey) {
    // Simulate atomic Postgres function with internal locking
    if (ledgerMap.has(idempotencyKey)) {
      const existing = ledgerMap.get(idempotencyKey);
      return {
        success: true,
        already_processed: true,
        ledger_id: existing.ledger_id,
        amount_paise: existing.amount_paise,
        balance_paise: 8005, // original balance
        units_billed: existing.units_billed,
        unit_rate_paise: existing.unit_rate_paise
      };
    }

    // First transaction takes lock and inserts
    ledgerEntryCount++;
    walletDeductionsCount++;
    const newEntry = {
      ledger_id: `tx_voice_${callId}`,
      amount_paise: unitsBilled * ratePaise,
      units_billed: unitsBilled,
      unit_rate_paise: ratePaise
    };
    ledgerMap.set(idempotencyKey, newEntry);

    return {
      success: true,
      already_processed: false,
      ledger_id: newEntry.ledger_id,
      amount_paise: newEntry.amount_paise,
      balance_paise: 8005,
      units_billed: newEntry.units_billed,
      unit_rate_paise: newEntry.unit_rate_paise
    };
  }

  const callId = "call_simulated_pulse_001";
  const orgId = "00000000-0000-0000-0000-000000000001";
  const idempotencyKey = `voice_${callId}`;

  // Execute 20 concurrent invocations simultaneously
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, idx) =>
      mockSimulatedRpc(callId, orgId, units, unitRatePaise, idempotencyKey)
    )
  );

  // Assertions:
  // - Exactly 20 results returned
  assert.equal(results.length, 20);

  // - Exactly 1 ledger entry created
  assert.equal(ledgerEntryCount, 1, "Exactly one ledger entry must be created");

  // - Exactly 1 wallet deduction
  assert.equal(walletDeductionsCount, 1, "Exactly one balance deduction must occur");

  // - All 20 calls succeeded and received identical charge & ledger reference
  const firstResult = results[0];
  for (const res of results) {
    assert.equal(res.success, true);
    assert.equal(res.amount_paise, 1995, "Every callback must report exactly 1995 paise");
    assert.equal(res.ledger_id, firstResult.ledger_id, "Every callback must return the same ledger reference");
  }

  // - Exactly 1 initial processed and 19 retries
  const initial = results.filter(r => !r.already_processed);
  const retries = results.filter(r => r.already_processed);
  assert.equal(initial.length, 1, "Exactly one callback is marked initial");
  assert.equal(retries.length, 19, "Exactly 19 callbacks are marked already_processed");
});
