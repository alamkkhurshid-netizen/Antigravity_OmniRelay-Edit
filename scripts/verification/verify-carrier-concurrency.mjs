#!/usr/bin/env node
/**
 * Real PostgreSQL Concurrency Verification for Carrier Recovery Task Transitions
 * Tracked in scripts/verification/
 * 
 * Executes 20 simultaneous concurrent transactions across separate connections against PostgreSQL.
 * Proves that SELECT ... FOR UPDATE serializes execution, enforces atomic version matching,
 * guarantees that exactly 1 claimant succeeds, and all 19 conflicting attempts receive 409 Conflict.
 * 
 * Safety features:
 * - Production database URL detection & blocking via assertSafeDatabaseTarget.
 * - Explicit ALLOW_DB_INTEGRATION_TESTS=true gate required.
 * - Guaranteed cleanup in outer finally block to prevent orphaned records.
 */

import pg from "pg";
import crypto from "crypto";
import { assertSafeDatabaseTarget } from "../db-guard.mjs";

export async function runCarrierConcurrencyTest(connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
  if (!connectionString) {
    console.log("[Carrier Concurrency Test] Skipped: No DATABASE_URL or SUPABASE_DB_URL set.");
    return { skipped: true, reason: "No database connection string configured" };
  }

  // 1. Strict Environment Safety Guard (blocks production unconditionally)
  const guard = assertSafeDatabaseTarget({
    connectionString,
    operationType: "concurrency-test",
    operationName: "carrier-recovery-concurrency-test",
    allowProdOverride: false
  });
  console.log(`[Carrier Concurrency Test] Target environment verified: ${guard.targetEnv}${guard.detectedRef ? ` (ref: ${guard.detectedRef})` : ""}`);

  const pool = new pg.Pool({
    connectionString,
    max: 25,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false }
  });

  const testOrgId = crypto.randomUUID();
  const testTaskId = crypto.randomUUID();
  const users = Array.from({ length: 20 }, () => crypto.randomUUID());
  let seeded = false;

  try {
    console.log(`[Carrier Concurrency Test] Initializing test org ${testOrgId} and task ${testTaskId}...`);

    const initClient = await pool.connect();
    try {
      await initClient.query("BEGIN;");

      // Seed organization
      await initClient.query(
        `INSERT INTO public.organizations (id, name) VALUES ($1, 'Carrier Concurrency Test Clinic') ON CONFLICT DO NOTHING;`,
        [testOrgId]
      );

      // Seed 20 receptionist users in auth.users and public.agents
      for (const userId of users) {
        await initClient.query(`
          INSERT INTO auth.users (id, email, raw_user_meta_data, role, created_at, updated_at)
          VALUES ($1, $2, '{"full_name": "Test Receptionist"}'::jsonb, 'authenticated', NOW(), NOW())
          ON CONFLICT (id) DO NOTHING;
        `, [userId, `receptionist_${userId.slice(0, 8)}@omnirelay.test`]);

        await initClient.query(`
          INSERT INTO public.agents (user_id, organization_id, role, extra)
          VALUES ($1, $2, 'receptionist', '{"role": "receptionist"}'::jsonb)
          ON CONFLICT (user_id, organization_id) DO NOTHING;
        `, [userId, testOrgId]);
      }

      // Seed the operational event representing carrier recovery
      await initClient.query(`
        INSERT INTO public.operational_events (
          id, organization_id, actor_user_id, event_source, error_code, safe_message, severity, metadata, created_at
        ) VALUES (
          $1, $2, $3, 'voice_carrier_recovery', 'CARRIER_EXHAUSTION_RECOVERY',
          'Voice carrier exhaustion recovery required.', 'critical',
          '{"version": 1, "action_centre_status": "pending_manual_intervention", "carrier_attempts": 3}'::jsonb,
          NOW()
        );
      `, [testTaskId, testOrgId, users[0]]);

      await initClient.query("COMMIT;");
      seeded = true;
    } finally {
      initClient.release();
    }

    console.log(`[Carrier Concurrency Test] Firing 20 simultaneous concurrent claims for task ${testTaskId}...`);

    // Launch 20 concurrent transactions simultaneously across separate pool connections
    const promises = users.map(async (userId) => {
      const client = await pool.connect();
      try {
        const res = await client.query(
          `SELECT public.transition_carrier_recovery_task(
            $1::uuid,
            'claim'::text,
            1::integer,
            NULL::text,
            $2::uuid,
            $3::uuid
          ) as result;`,
          [testTaskId, userId, testOrgId]
        );
        return {
          userId,
          result: res.rows[0].result
        };
      } finally {
        client.release();
      }
    });

    const responses = await Promise.all(promises);
    console.log(`[Carrier Concurrency Test] All 20 calls completed.`);

    // Analyze results
    const successful = responses.filter(r => r.result.success === true && r.result.status === 200);
    const conflicts = responses.filter(r => r.result.success === false && r.result.status === 409);

    console.log(`[Carrier Concurrency Test] Successful claims: ${successful.length}`);
    console.log(`[Carrier Concurrency Test] Conflicting claims (409): ${conflicts.length}`);

    // Verify in database
    const verifyClient = await pool.connect();
    let finalEvent;
    let assignmentCount = 0;
    let auditClaimCount = 0;

    try {
      const eventRes = await verifyClient.query(
        `SELECT metadata FROM public.operational_events WHERE id = $1;`,
        [testTaskId]
      );
      finalEvent = eventRes.rows[0];

      const assignRes = await verifyClient.query(
        `SELECT COUNT(*)::int as count FROM public.action_centre_assignments 
         WHERE organization_id = $1 AND item_kind = 'carrier_recovery' AND subject_id = $2 AND status = 'claimed';`,
        [testOrgId, testTaskId]
      );
      assignmentCount = assignRes.rows[0].count;

      const auditRes = await verifyClient.query(
        `SELECT COUNT(*)::int as count FROM public.operational_events 
         WHERE organization_id = $1 AND error_code = 'CARRIER_RECOVERY_CLAIMED' AND metadata->>'task_id' = $2;`,
        [testOrgId, testTaskId]
      );
      auditClaimCount = auditRes.rows[0].count;
    } finally {
      verifyClient.release();
    }

    // Invariant assertions
    if (responses.length !== 20) throw new Error(`Expected 20 responses, got ${responses.length}`);
    if (successful.length !== 1) {
      throw new Error(`Expected exactly 1 successful claim, got ${successful.length}`);
    }
    if (conflicts.length !== 19) {
      throw new Error(`Expected exactly 19 409 conflicts, got ${conflicts.length}`);
    }
    if (finalEvent.metadata.version !== 2) {
      throw new Error(`Expected final version 2, got ${finalEvent.metadata.version}`);
    }
    if (assignmentCount !== 1) {
      throw new Error(`Expected exactly 1 claimed assignment row, got ${assignmentCount}`);
    }
    if (auditClaimCount !== 1) {
      throw new Error(`Expected exactly 1 CARRIER_RECOVERY_CLAIMED audit row, got ${auditClaimCount}`);
    }

    console.log("[Carrier Concurrency Test] PASSED: Exactly 1 claimant won, 19 received 409 Conflict, state atomically updated.");
    return {
      success: true,
      winnerId: successful[0].userId,
      successfulCount: successful.length,
      conflictCount: conflicts.length,
      finalVersion: finalEvent.metadata.version
    };
  } finally {
    if (seeded) {
      console.log(`[Carrier Concurrency Test] Cleaning up test records...`);
      const cleanClient = await pool.connect();
      try {
        await cleanClient.query("BEGIN;");
        await cleanClient.query(`DELETE FROM public.action_centre_assignments WHERE organization_id = $1;`, [testOrgId]);
        await cleanClient.query(`DELETE FROM public.operational_events WHERE organization_id = $1;`, [testOrgId]);
        await cleanClient.query(`DELETE FROM public.agents WHERE organization_id = $1;`, [testOrgId]);
        for (const u of users) {
          await cleanClient.query(`DELETE FROM auth.users WHERE id = $1;`, [u]);
        }
        await cleanClient.query(`DELETE FROM public.organizations WHERE id = $1;`, [testOrgId]);
        await cleanClient.query("COMMIT;");
      } catch (err) {
        console.warn(`[Carrier Concurrency Test] Cleanup warning: ${err.message}`);
      } finally {
        cleanClient.release();
      }
    }
    await pool.end();
  }
}

// Direct CLI execution
if (process.argv[1] && process.argv[1].endsWith("verify-carrier-concurrency.mjs")) {
  runCarrierConcurrencyTest()
    .then((res) => {
      if (res.skipped) {
        console.log(`[Carrier Concurrency Test] ${res.reason}`);
      } else {
        console.log(`[Carrier Concurrency Test] Success:`, res);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Carrier Concurrency Test] Failed:", err);
      process.exit(1);
    });
}
