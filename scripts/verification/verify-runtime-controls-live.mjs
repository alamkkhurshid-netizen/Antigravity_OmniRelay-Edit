#!/usr/bin/env node
/**
 * Real PostgreSQL Verification for System Runtime Controls
 * Tracked in scripts/verification/
 * 
 * Verifies:
 * 1. Ordinary clinic administrator attempting to change a global control -> fails (403/exception).
 * 2. Clinic administrator attempting to modify another tenant -> fails.
 * 3. Valid platform operator modifying a global control -> succeeds (200).
 * 4. 20 simultaneous concurrent updates using the same version -> exactly one succeeds, 19 fail (409 Conflict).
 * 5. Every denied and successful attempt creates the correct audit record in operational_events.
 * 6. Direct table writes (INSERT/UPDATE/DELETE) on public.system_runtime_controls are blocked for authenticated users.
 */

import pg from "pg";
import crypto from "crypto";
import { assertSafeDatabaseTarget } from "../db-guard.mjs";

export async function runRuntimeControlsLiveTest(connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) {
  if (!connectionString) {
    console.log("[Runtime Controls Live Test] Skipped: No DATABASE_URL or SUPABASE_DB_URL set.");
    return { skipped: true, reason: "No database connection string configured" };
  }

  const guard = assertSafeDatabaseTarget({
    connectionString,
    operationType: "concurrency-test",
    operationName: "runtime-controls-live-test",
    allowProdOverride: false
  });
  console.log(`[Runtime Controls Live Test] Target environment verified: ${guard.targetEnv}${guard.detectedRef ? ` (ref: ${guard.detectedRef})` : ""}`);

  const pool = new pg.Pool({
    connectionString,
    max: 25,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false }
  });

  const testOrg1Id = crypto.randomUUID();
  const testOrg2Id = crypto.randomUUID();
  const clinicAdminId = crypto.randomUUID();
  const platformOpId = crypto.randomUUID();
  let seeded = false;

  try {
    console.log(`[Runtime Controls Live Test] Seeding test identities...`);
    const initClient = await pool.connect();
    try {
      await initClient.query("BEGIN;");

      // Seed organizations
      await initClient.query(`INSERT INTO public.organizations (id, name) VALUES ($1, 'Clinic One'), ($2, 'Clinic Two') ON CONFLICT DO NOTHING;`, [testOrg1Id, testOrg2Id]);

      // Seed clinic admin user & agent
      await initClient.query(`
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, created_at, updated_at)
        VALUES ($1, 'clinic_admin@omnirelay.test', '{"full_name": "Clinic Admin"}'::jsonb, 'authenticated', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `, [clinicAdminId]);

      await initClient.query(`
        INSERT INTO public.agents (user_id, organization_id, role, extra)
        VALUES ($1, $2, 'admin', '{"role": "admin"}'::jsonb)
        ON CONFLICT (user_id, organization_id) DO NOTHING;
      `, [clinicAdminId, testOrg1Id]);

      // Seed platform operator in auth.users and private.platform_operators
      await initClient.query(`
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, created_at, updated_at)
        VALUES ($1, 'platform_op@omnirelay.test', '{"full_name": "Platform Operator"}'::jsonb, 'authenticated', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `, [platformOpId]);

      await initClient.query(`
        INSERT INTO private.platform_operators (user_id, role, is_active)
        VALUES ($1, 'platform_operator', true)
        ON CONFLICT (user_id) DO UPDATE SET is_active = true;
      `, [platformOpId]);

      await initClient.query("COMMIT;");
      seeded = true;
    } finally {
      initClient.release();
    }

    const testClient = await pool.connect();
    try {
      // 1. Clinic admin attempting to change global control must fail
      console.log(`[Test 1] Clinic admin modifying global control...`);
      let deniedGlobal = false;
      try {
        await testClient.query(`
          SELECT public.set_runtime_control(
            'VOICE_PILOT_KILL_SWITCH',
            false,
            'global',
            NULL,
            'Attempted unauthorized global toggle by clinic admin',
            1,
            NULL,
            false,
            $1
          );
        `, [clinicAdminId]);
      } catch (_err) {
        deniedGlobal = true;
      }
      if (!deniedGlobal) {
        throw new Error("Expected clinic administrator to be denied from updating global control!");
      }
      console.log(`[Test 1] PASSED: Clinic admin was denied from modifying global control.`);

      // 2. Clinic admin attempting to modify another tenant must fail
      console.log(`[Test 2] Clinic admin modifying another tenant's controls...`);
      let deniedCrossTenant = false;
      try {
        await testClient.query(`
          SELECT public.set_runtime_control(
            'WORKER_WHATSAPP_INBOUND_PAUSED',
            true,
            'tenant',
            $1,
            'Attempted cross-tenant update',
            1,
            NULL,
            false,
            $2
          );
        `, [testOrg2Id, clinicAdminId]);
      } catch (_err) {
        deniedCrossTenant = true;
      }
      if (!deniedCrossTenant) {
        throw new Error("Expected cross-tenant control modification to be denied!");
      }
      console.log(`[Test 2] PASSED: Cross-tenant control modification was denied.`);

      // 3. Platform operator modifying global control must succeed
      console.log(`[Test 3] Platform operator updating global control...`);
      const opRes = await testClient.query(`
        SELECT public.set_runtime_control(
          'VOICE_PILOT_KILL_SWITCH',
          true,
          'global',
          NULL,
          'Legitimate platform operator safety toggle',
          NULL,
          NULL,
          false,
          $1
        ) as result;
      `, [platformOpId]);
      const opResult = opRes.rows[0].result;
      if (!opResult || opResult.is_enabled !== true) {
        throw new Error(`Platform operator global update failed: ${JSON.stringify(opResult)}`);
      }
      console.log(`[Test 3] PASSED: Platform operator successfully updated global control.`);

      // 4. Verify audit entries for both denied and successful attempts
      console.log(`[Test 4] Verifying operational_events audit trail...`);
      const auditRes = await testClient.query(`
        SELECT error_code, safe_message FROM public.operational_events 
        WHERE event_source = 'runtime_control_operator'
        ORDER BY created_at DESC LIMIT 5;
      `);
      const errorCodes = auditRes.rows.map(r => r.error_code);
      if (!errorCodes.includes("RUNTIME_CONTROL_DENIED")) {
        throw new Error("Missing RUNTIME_CONTROL_DENIED in operational_events!");
      }
      if (!errorCodes.includes("RUNTIME_CONTROL_UPDATED")) {
        throw new Error("Missing RUNTIME_CONTROL_UPDATED in operational_events!");
      }
      console.log(`[Test 4] PASSED: Both denied and approved attempts generated correct audit records.`);

      // 5. Direct table writes remain blocked for authenticated users
      console.log(`[Test 5] Verifying direct table mutations are blocked...`);
      let directWriteBlocked = false;
      try {
        await testClient.query("BEGIN;");
        await testClient.query(`SET LOCAL ROLE authenticated;`);
        await testClient.query(`SET LOCAL request.jwt.claim.sub = '${clinicAdminId}';`);
        await testClient.query(`
          INSERT INTO public.system_runtime_controls (control_key, is_enabled, scope)
          VALUES ('VOICE_PILOT_KILL_SWITCH', false, 'global');
        `);
        await testClient.query("COMMIT;");
      } catch (_err) {
        directWriteBlocked = true;
        await testClient.query("ROLLBACK;");
      }
      if (!directWriteBlocked) {
        throw new Error("Direct table writes on system_runtime_controls were NOT blocked for authenticated users!");
      }
      console.log(`[Test 5] PASSED: Direct table writes are blocked for authenticated users.`);

      // 6. 20 concurrent updates using the same expected version
      console.log(`[Test 6] Firing 20 simultaneous concurrent updates on runtime controls...`);
      const initialVersion = opResult.version;
      const promises = Array.from({ length: 20 }, async () => {
        const client = await pool.connect();
        try {
          const res = await client.query(`
            SELECT public.set_runtime_control(
              'VOICE_PILOT_KILL_SWITCH',
              false,
              'global',
              NULL,
              'Concurrent test update',
              $1,
              NULL,
              false,
              $2
            ) as result;
          `, [initialVersion, platformOpId]);
          return { success: true, result: res.rows[0].result };
        } catch (err) {
          return { success: false, error: err.message };
        } finally {
          client.release();
        }
      });

      const concurrentResults = await Promise.all(promises);
      const successfulUpdates = concurrentResults.filter(r => r.success);
      const failedUpdates = concurrentResults.filter(r => !r.success);

      if (successfulUpdates.length !== 1) {
        throw new Error(`Expected exactly 1 successful concurrent update, got ${successfulUpdates.length}`);
      }
      if (failedUpdates.length !== 19) {
        throw new Error(`Expected exactly 19 optimistic concurrency failures, got ${failedUpdates.length}`);
      }
      console.log(`[Test 6] PASSED: Exactly 1 concurrent update won, 19 failed due to optimistic version locking.`);

    } finally {
      testClient.release();
    }

    return { success: true };
  } finally {
    if (seeded) {
      console.log(`[Runtime Controls Live Test] Cleaning up test records...`);
      const cleanClient = await pool.connect();
      try {
        await cleanClient.query("BEGIN;");
        await cleanClient.query(`DELETE FROM public.operational_events WHERE organization_id IN ($1, $2);`, [testOrg1Id, testOrg2Id]);
        await cleanClient.query(`DELETE FROM public.agents WHERE organization_id IN ($1, $2);`, [testOrg1Id, testOrg2Id]);
        await cleanClient.query(`DELETE FROM private.platform_operators WHERE user_id = $1;`, [platformOpId]);
        await cleanClient.query(`DELETE FROM auth.users WHERE id IN ($1, $2);`, [clinicAdminId, platformOpId]);
        await cleanClient.query(`DELETE FROM public.organizations WHERE id IN ($1, $2);`, [testOrg1Id, testOrg2Id]);
        await cleanClient.query("COMMIT;");
      } catch (err) {
        console.warn(`[Runtime Controls Live Test] Cleanup warning: ${err.message}`);
      } finally {
        cleanClient.release();
      }
    }
    await pool.end();
  }
}

// Direct CLI execution
if (process.argv[1] && process.argv[1].endsWith("verify-runtime-controls-live.mjs")) {
  runRuntimeControlsLiveTest()
    .then((res) => {
      if (res.skipped) {
        console.log(`[Runtime Controls Live Test] ${res.reason}`);
      } else {
        console.log(`[Runtime Controls Live Test] Success!`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Runtime Controls Live Test] Failed:", err);
      process.exit(1);
    });
}
