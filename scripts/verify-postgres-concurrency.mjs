#!/usr/bin/env node
/**
 * Real PostgreSQL Concurrency Verification for billing.record_and_deduct
 * 
 * Executes 20 simultaneous concurrent transactions across separate connections against PostgreSQL.
 * Proves that pg_advisory_xact_lock serializes execution, prevents duplicate deductions,
 * and guarantees 20 successful idempotent responses with identical charge and ledger ID.
 */

import pg from "pg";
import crypto from "crypto";

export async function runPostgresConcurrencyTest(connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
  if (!connectionString) {
    console.log("[Postgres Concurrency Test] Skipped: No DATABASE_URL or SUPABASE_DB_URL set.");
    return { skipped: true };
  }

  const pool = new pg.Pool({
    connectionString,
    max: 25,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false }
  });

  const testOrgId = crypto.randomUUID();
  const testMetaMsgId = `real_conc_call_${Date.now()}_${crypto.randomUUID()}`;
  const initialBalancePaise = 50000; // ₹500.00
  const callDurationMinutes = 5;
  const expectedDeductionPaise = 1995; // 5 min @ ₹3.99/min

  console.log(`[Postgres Concurrency Test] Initializing test org ${testOrgId}...`);

  const initClient = await pool.connect();
  try {
    // 1. Create org and wallet
    await initClient.query(
      `INSERT INTO public.organizations (id, name, slug) VALUES ($1, 'Concurrency Test Clinic', $2) ON CONFLICT DO NOTHING;`,
      [testOrgId, `conc-test-${Date.now()}`]
    );
    await initClient.query(
      `INSERT INTO billing.tenant_wallets (organization_id, balance_paise) VALUES ($1, $2) ON CONFLICT (organization_id) DO UPDATE SET balance_paise = $2;`,
      [testOrgId, initialBalancePaise]
    );
  } finally {
    initClient.release();
  }

  console.log(`[Postgres Concurrency Test] Firing 20 simultaneous concurrent calls to billing.record_and_deduct...`);

  // 2. Launch 20 concurrent transactions simultaneously across separate pool connections
  const promises = Array.from({ length: 20 }, async (_, idx) => {
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT billing.record_and_deduct($1::uuid, $2::text, 'voice'::text, 'voice'::text, 'IN'::text, $3::integer) as result;`,
        [testOrgId, testMetaMsgId, callDurationMinutes]
      );
      return res.rows[0].result;
    } finally {
      client.release();
    }
  });

  const results = await Promise.all(promises);

  console.log(`[Postgres Concurrency Test] All 20 calls completed.`);

  // 3. Verify in database
  const verifyClient = await pool.connect();
  let ledgerCount = 0;
  let finalBalancePaise = 0;
  try {
    const ledgerRes = await verifyClient.query(
      `SELECT COUNT(*)::int as count FROM billing.message_ledger WHERE meta_message_id = $1;`,
      [testMetaMsgId]
    );
    ledgerCount = ledgerRes.rows[0].count;

    const walletRes = await verifyClient.query(
      `SELECT balance_paise FROM billing.tenant_wallets WHERE organization_id = $1;`,
      [testOrgId]
    );
    finalBalancePaise = Number(walletRes.rows[0].balance_paise);

    // Cleanup test data
    await verifyClient.query(`DELETE FROM billing.message_ledger WHERE meta_message_id = $1;`, [testMetaMsgId]);
    await verifyClient.query(`DELETE FROM billing.tenant_wallets WHERE organization_id = $1;`, [testOrgId]);
    await verifyClient.query(`DELETE FROM public.organizations WHERE id = $1;`, [testOrgId]);
  } finally {
    verifyClient.release();
    await pool.end();
  }

  // 4. Assertions
  if (results.length !== 20) throw new Error(`Expected 20 results, got ${results.length}`);
  if (ledgerCount !== 1) throw new Error(`Expected exactly 1 ledger row, got ${ledgerCount}`);
  const expectedBalance = initialBalancePaise - expectedDeductionPaise;
  if (finalBalancePaise !== expectedBalance) {
    throw new Error(`Expected final balance ${expectedBalance}, got ${finalBalancePaise}`);
  }

  const initialDeductions = results.filter((r) => !r.already_deducted);
  const duplicateDeductions = results.filter((r) => r.already_deducted);

  if (initialDeductions.length !== 1) {
    throw new Error(`Expected exactly 1 initial deduction, got ${initialDeductions.length}`);
  }
  if (duplicateDeductions.length !== 19) {
    throw new Error(`Expected exactly 19 duplicates marked already_deducted, got ${duplicateDeductions.length}`);
  }

  const firstLedgerId = results[0].ledger_id;
  for (const r of results) {
    if (r.ledger_id !== firstLedgerId) {
      throw new Error(`Mismatched ledger_id: ${r.ledger_id} vs ${firstLedgerId}`);
    }
    if (Number(r.deducted_paise) !== expectedDeductionPaise) {
      throw new Error(`Mismatched deducted_paise: ${r.deducted_paise} vs ${expectedDeductionPaise}`);
    }
  }

  console.log(`[Postgres Concurrency Test] PROVEN: Exactly 1 charge (₹19.95), exactly 1 ledger entry, 20 successful responses (19 marked already_deducted).`);
  return { success: true, ledgerCount, finalBalancePaise, responsesCount: results.length };
}

// CLI Execution entrypoint
import { fileURLToPath } from "url";
import { resolve } from "path";
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runPostgresConcurrencyTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Postgres Concurrency Test] Failure:", err);
      process.exit(1);
    });
}
