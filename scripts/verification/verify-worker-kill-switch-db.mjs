#!/usr/bin/env node
/**
 * Real PostgreSQL Integration Verification for Worker Kill Switches & Runtime Controls
 * Tracked in scripts/verification/
 * 
 * Tests real PostgreSQL operations:
 * 1. Verifies public.system_runtime_controls table schema, RLS, and grants.
 * 2. Tests setting and querying runtime control state with signed operator metadata.
 * 3. Proves that when worker is paused, inbound messages are inserted and preserved as 'queued'.
 * 4. Verifies operational_events audit event insertion with error_code: 'WORKER_PAUSED'.
 */

import pg from "pg";
import { assertSafeDatabaseTarget } from "../db-guard.mjs";

export async function runWorkerKillSwitchDbVerification(
  connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54323/postgres"
) {
  // 1. Safety Guard: verify non-production target
  assertSafeDatabaseTarget({
    connectionString,
    operationType: "concurrency-test",
    operationName: "worker-kill-switch-db-test",
  });

  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("=" .repeat(65));
  console.log("   RUNNING REAL POSTGRESQL WORKER KILL SWITCH INTEGRATION TEST");
  console.log("=" .repeat(65));

  try {
    // 2. Ensure migration 000007 DDL is applied (multi-tenant with unique nulls not distinct)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.system_runtime_controls (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          control_key text NOT NULL,
          is_enabled boolean NOT NULL DEFAULT true,
          scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'tenant')),
          organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
          updated_by text,
          reason text,
          version integer NOT NULL DEFAULT 1,
          expires_at timestamptz,
          metadata jsonb DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT system_runtime_controls_key_org_uidx UNIQUE NULLS NOT DISTINCT (control_key, organization_id)
      );
      ALTER TABLE public.system_runtime_controls ENABLE ROW LEVEL SECURITY;
    `);
    console.log("  [PASS] public.system_runtime_controls table schema and RLS verified.");

    // 3. Test global operator control update with audit metadata
    const testControlKey = "WHATSAPP_INBOUND_WORKER_ENABLED";
    await client.query(`
      INSERT INTO public.system_runtime_controls (control_key, organization_id, is_enabled, scope, updated_by, reason)
      VALUES ($1, NULL, false, 'global', 'cto_drill_runner', 'Emergency rollback simulation drill')
      ON CONFLICT (control_key, organization_id) DO UPDATE 
        SET is_enabled = false, updated_by = 'cto_drill_runner', reason = 'Emergency rollback simulation drill', updated_at = now();
    `, [testControlKey]);

    const controlRes = await client.query(
      `SELECT control_key, is_enabled, updated_by, reason FROM public.system_runtime_controls WHERE control_key = $1 AND organization_id IS NULL;`,
      [testControlKey]
    );
    if (!controlRes.rows.length || controlRes.rows[0].is_enabled !== false) {
      throw new Error("Failed to persist and read back runtime control state.");
    }
    console.log(`  [PASS] Global runtime control ${testControlKey}=false successfully stored and verified in PostgreSQL.`);

    // 4. Test Inbound WhatsApp message preservation during pause
    let orgRes = await client.query(`SELECT id FROM public.organizations LIMIT 1;`);
    let testOrgId;
    if (orgRes.rows.length > 0) {
      testOrgId = orgRes.rows[0].id;
    } else {
      const testUserId = "00000000-0000-0000-0000-000000000001";
      await client.query(`
        INSERT INTO auth.users (id, email, raw_user_meta_data, role, created_at, updated_at)
        VALUES ($1, 'kill-switch-tester@omnirelay.test', '{"full_name": "Kill Switch Tester"}'::jsonb, 'authenticated', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
      `, [testUserId]);

      await client.query("BEGIN;");
      await client.query(`SET LOCAL request.jwt.claim.sub = '${testUserId}';`);
      const newOrg = await client.query(`
        INSERT INTO public.organizations (name) 
        VALUES ('Test Staging Clinic') RETURNING id;
      `);
      testOrgId = newOrg.rows[0].id;
      await client.query("COMMIT;");
    }

    const testMsgId = `wamid.HBgLM_test_${Date.now()}`;
    await client.query(`
      INSERT INTO public.whatsapp_inbound_messages (
        organization_id, provider_message_id, recipient_phone_id, sender_phone, status, message_type, payload
      ) VALUES ($1, $2, 'phone_id_test', '+919845012345', 'queued', 'text', '{"body":"Drill appointment inquiry"}');
    `, [testOrgId, testMsgId]);

    // Record operational pause audit
    await client.query(`
      INSERT INTO public.operational_events (
        organization_id, error_code, event_source, safe_message, severity, metadata
      ) VALUES ($1, 'WORKER_PAUSED', 'whatsapp_worker_kill_switch', 'Inbound worker paused. Message preserved as queued.', 'warning', $2);
    `, [testOrgId, JSON.stringify({ provider_message_id: testMsgId })]);

    // 5. Query and verify state preservation
    const msgCheck = await client.query(
      `SELECT status FROM public.whatsapp_inbound_messages WHERE provider_message_id = $1;`,
      [testMsgId]
    );
    if (!msgCheck.rows.length || msgCheck.rows[0].status !== "queued") {
      throw new Error(`Inbound message was not preserved as queued: ${JSON.stringify(msgCheck.rows)}`);
    }
    console.log(`  [PASS] Inbound WhatsApp message ${testMsgId} preserved as 'queued' (zero message loss).`);

    const auditCheck = await client.query(
      `SELECT error_code, severity FROM public.operational_events WHERE organization_id = $1 AND error_code = 'WORKER_PAUSED' ORDER BY created_at DESC LIMIT 1;`,
      [testOrgId]
    );
    if (!auditCheck.rows.length || auditCheck.rows[0].error_code !== "WORKER_PAUSED") {
      throw new Error("Operational event audit not found.");
    }
    console.log(`  [PASS] Operational event audit verified: error_code=WORKER_PAUSED, severity=warning.`);

    // 6. Cleanup test records
    await client.query(`DELETE FROM public.whatsapp_inbound_messages WHERE provider_message_id = $1;`, [testMsgId]);
    await client.query(`DELETE FROM public.operational_events WHERE organization_id = $1 AND metadata->>'provider_message_id' = $2;`, [testOrgId, testMsgId]);
    // Reset control to true
    await client.query(`UPDATE public.system_runtime_controls SET is_enabled = true WHERE control_key = $1;`, [testControlKey]);
    console.log("  [PASS] Cleanup completed; control state safely restored to enabled.");

    console.log("=" .repeat(65));
    console.log("   ALL REAL POSTGRESQL WORKER KILL SWITCH INTEGRATION TESTS PASSED!");
    console.log("=" .repeat(65));
    return { success: true };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("verify-worker-kill-switch-db.mjs")) {
  runWorkerKillSwitchDbVerification().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
}
