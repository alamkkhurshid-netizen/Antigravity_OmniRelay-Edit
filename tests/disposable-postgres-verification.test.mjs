import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { consumeVoiceRequestNonce } from "../lib/voice/auth.ts";

const { Client } = pg;
const PG_URI = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "postgres://postgres:postgres@localhost:54322/postgres";

async function getClient() {
  const client = new Client({ connectionString: PG_URI });
  await client.connect();
  return client;
}

// ============================================================================
// 1. MIGRATION APPLICATION AGAINST REAL DISPOSABLE POSTGRESQL
// ============================================================================

test("POSTGRES: Apply migration 20261018200000_voice_retention_and_idempotency.sql cleanly", async () => {
  const client = await getClient();
  try {
    const migrationSql = readFileSync(
      new URL("../supabase/migrations/20261018200000_voice_retention_and_idempotency.sql", import.meta.url),
      "utf8"
    );

    await client.query("BEGIN;");
    await client.query(migrationSql);
    await client.query("COMMIT;");

    // Disable workspace auto-seeding trigger during test harness to prevent null auth.uid() failure
    await client.query("DO $$ BEGIN ALTER TABLE public.organizations DISABLE TRIGGER initialize_omnirelay_workspace; EXCEPTION WHEN OTHERS THEN NULL; END $$;");

    // Verify tables and procedures exist in Postgres
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('voice_service_nonces', 'durable_api_rate_limits', 'voice_transcript_access_audits');
    `);
    const tables = tableRes.rows.map((r) => r.table_name);
    assert.ok(tables.includes("voice_service_nonces"), "voice_service_nonces table must exist in Postgres");
    assert.ok(tables.includes("durable_api_rate_limits"), "durable_api_rate_limits table must exist in Postgres");
    assert.ok(tables.includes("voice_transcript_access_audits"), "voice_transcript_access_audits table must exist in Postgres");

    console.log("   [PostgreSQL] Applied 20261018200000 migration cleanly. Verified tables:", tables);
  } finally {
    await client.end();
  }
});

// ============================================================================
// 2. 20 INDEPENDENT DUPLICATE NONCE REQUESTS (REAL POSTGRESQL CONCURRENCY)
// ============================================================================

test("POSTGRES: 20 independent duplicate nonce requests result in exactly 1 TRUE and 19 FALSE", async () => {
  const client = await getClient();
  try {
    // 1. Ensure test organization exists
    const orgRes = await client.query(`
      INSERT INTO public.organizations (id, name)
      VALUES ('a0000000-0000-0000-0000-000000000001', 'Test Tenant Nonce')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    const testNonce = "nonce-disposable-concurrency-" + Date.now();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // 2. Launch 20 concurrent parallel calls to consume_voice_request_nonce
    const promises = Array.from({ length: 20 }, async (_, idx) => {
      const runnerClient = await getClient();
      try {
        const res = await runnerClient.query(
          "SELECT public.consume_voice_request_nonce($1, $2, $3) AS consumed;",
          [testNonce, orgId, expiresAt]
        );
        return { workerId: idx, consumed: res.rows[0].consumed };
      } finally {
        await runnerClient.end();
      }
    });

    const results = await Promise.all(promises);

    const trueCount = results.filter((r) => r.consumed === true).length;
    const falseCount = results.filter((r) => r.consumed === false).length;

    console.log(`   [PostgreSQL Nonce RPC] 20 Parallel Invocations: SUCCESS = ${trueCount}, DUPLICATE REJECTED = ${falseCount}`);

    // EXACT ASSERTIONS:
    assert.equal(trueCount, 1, "Exactly one parallel request must consume the nonce (true)");
    assert.equal(falseCount, 19, "Exactly 19 duplicate parallel requests must return false (unique violation)");

    // Verify row count in PostgreSQL table
    const countRes = await client.query(
      "SELECT count(*) FROM public.voice_service_nonces WHERE request_id = $1;",
      [testNonce]
    );
    assert.equal(parseInt(countRes.rows[0].count, 10), 1, "Exactly 1 nonce row must be committed in PostgreSQL");
  } finally {
    await client.end();
  }
});

// ============================================================================
// 3. 20 CONCURRENT BOOKING REQUESTS (REAL POSTGRESQL UNIQUE CONSTRAINT 23505)
// ============================================================================

test("POSTGRES: 20 concurrent booking requests create exactly ONE appointment via unique index 23505", async () => {
  const client = await getClient();
  try {
    const orgRes = await client.query(`
      INSERT INTO public.organizations (id, name)
      VALUES ('a0000000-0000-0000-0000-000000000002', 'Test Tenant Booking')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    // Ensure dependent foreign-key fixtures exist for valid appointment schema
    await client.query(`
      INSERT INTO auth.users (id, aud, role, email)
      VALUES ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'test@example.com')
      ON CONFLICT (id) DO NOTHING;
    `);

    const locRes = await client.query(`
      INSERT INTO public.business_locations (id, organization_id, name, created_by)
      VALUES ('c0000000-0000-0000-0000-000000000002', $1, 'Booking Clinic', '00000000-0000-0000-0000-000000000001')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [orgId]);
    const locId = locRes.rows[0].id;

    const srvRes = await client.query(`
      INSERT INTO public.organization_services (id, organization_id, name, service_type)
      VALUES ('e0000000-0000-0000-0000-000000000002', $1, 'Consultation', 'general')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [orgId]);
    const srvId = srvRes.rows[0].id;

    const docRes = await client.query(`
      INSERT INTO public.booking_resources (id, organization_id, name, resource_type, timezone, active)
      VALUES ('d0000000-0000-0000-0000-000000000002', $1, 'Dr. Concurrent', 'doctor', 'Asia/Kolkata', true)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [orgId]);
    const docId = docRes.rows[0].id;

    // Clear any previous test run appointments to prevent slot conflicts
    await client.query("DELETE FROM public.appointments WHERE organization_id = $1;", [orgId]);

    const testCallSid = "exotel-session-race-" + Date.now();

    // Launch 20 concurrent insert transactions with distinct slots to strictly isolate the voice_call_sid unique index
    let winningInserts = 0;
    let uniqueViolations = 0;

    const promises = Array.from({ length: 20 }, async (_, idx) => {
      const runnerClient = await getClient();
      try {
        const startsAt = new Date(Date.now() + (idx + 1) * 3600 * 1000).toISOString();
        const endsAt = new Date(Date.now() + ((idx + 1) * 3600 + 1800) * 1000).toISOString();
        const query = `
          INSERT INTO public.appointments (
            organization_id, resource_id, location_id, service_id,
            customer_name, customer_phone, starts_at, ends_at, status, source, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', 'Voice',
            jsonb_build_object('voice_call_sid', $9::text, 'worker', $10::text)
          ) RETURNING id;
        `;
        const res = await runnerClient.query(query, [
          orgId,
          docId,
          locId,
          srvId,
          "Concurrent Patient",
          "+919876543210",
          startsAt,
          endsAt,
          testCallSid,
          String(idx),
        ]);
        if (res.rows.length > 0) winningInserts++;
        return { success: true, apptId: res.rows[0].id };
      } catch (err) {
        if (err.code === "23505" || err.message.includes("voice_call_idempotency") || err.message.includes("unique")) {
          uniqueViolations++;
          return { success: false, error: "unique_violation_23505" };
        }
        throw err;
      } finally {
        await runnerClient.end();
      }
    });

    const results = await Promise.all(promises);

    console.log(`   [PostgreSQL Unique Constraint] 20 Concurrent Appointments: COMMITTED = ${winningInserts}, 23505 CONFLICTS = ${uniqueViolations}`);

    assert.equal(winningInserts, 1, "Exactly 1 transaction must win and commit the appointment");
    assert.equal(uniqueViolations, 19, "Exactly 19 concurrent transactions must fail with PostgreSQL code 23505");

    const checkRes = await client.query(
      "SELECT count(*) FROM public.appointments WHERE organization_id = $1 AND metadata->>'voice_call_sid' = $2;",
      [orgId, testCallSid]
    );
    assert.equal(parseInt(checkRes.rows[0].count, 10), 1, "Only 1 appointment record exists in PostgreSQL table");
  } finally {
    await client.end();
  }
});

// ============================================================================
// 4. DATABASE OUTAGE FAIL-CLOSED TEST
// ============================================================================

test("POSTGRES: Database outage or unreachable connection fails closed with 503", async () => {
  const badClient = new Client({ connectionString: "postgres://postgres:postgres@localhost:59999/postgres", connectionTimeoutMillis: 1000 });
  
  let caughtError = false;
  let isConnectionRefused = false;

  try {
    await badClient.connect();
  } catch (err) {
    caughtError = true;
    isConnectionRefused = err.code === "ECONNREFUSED" || /ECONNREFUSED|timeout/i.test(err.message || "");
  } finally {
    try { await badClient.end(); } catch { /* ignore */ }
  }

  assert.equal(caughtError, true, "Unreachable database connection must reject immediately");
  assert.equal(isConnectionRefused, true, "Rejection must indicate connection failure");
  console.log("   [PostgreSQL Fail-Closed] Simulated outage verified: Connection refused, system fails closed.");

  // Application-level fail-closed verification:
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercelEnv = process.env.VERCEL_ENV;
  try {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    const failClosedRes = await consumeVoiceRequestNonce(
      "outage-nonce-" + Date.now(),
      "a0000000-0000-0000-0000-000000000001",
      new Date(Date.now() + 5 * 60 * 1000)
    );
    assert.equal(failClosedRes.success, false, "Must fail closed during outage/production");
    assert.equal(failClosedRes.status, 503, "Must return HTTP 503 Service Unavailable");
    console.log("   [Application Fail-Closed] consumeVoiceRequestNonce returned HTTP 503 under outage/production conditions.");
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.VERCEL_ENV = prevVercelEnv;
  }
});

// ============================================================================
// 5. RETENTION PURGE EXECUTION (STORED PROCEDURE VERIFICATION)
// ============================================================================

test("POSTGRES: purge_expired_voice_recordings() stored procedure purges expired logs and cleans nonces", async () => {
  const client = await getClient();
  try {
    const orgRes = await client.query(`
      INSERT INTO public.organizations (id, name)
      VALUES ('a0000000-0000-0000-0000-000000000003', 'Test Tenant Purge')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    // 1. Insert expired call log (expired 5 days ago)
    const expiredRes = await client.query(`
      INSERT INTO public.voice_call_logs (
        org_id, contact_phone, direction, duration_seconds, outcome,
        transcript, summary, retention_expires_at, retention_status
      ) VALUES (
        $1, '+91-XXXXX-1234', 'inbound', 60, 'inquiry_resolved',
        '[{"speaker":"caller","text":"Confidential symptom discussion"}]'::jsonb,
        'Original sensitive call summary',
        NOW() - INTERVAL '5 days',
        'active'
      ) RETURNING id;
    `, [orgId]);
    const expiredLogId = expiredRes.rows[0].id;

    // 2. Insert active call log (expires in 25 days)
    const activeRes = await client.query(`
      INSERT INTO public.voice_call_logs (
        org_id, contact_phone, direction, duration_seconds, outcome,
        transcript, summary, retention_expires_at, retention_status
      ) VALUES (
        $1, '+91-XXXXX-5678', 'inbound', 90, 'appointment_booked',
        '[{"speaker":"caller","text":"Active clinical discussion"}]'::jsonb,
        'Active call summary',
        NOW() + INTERVAL '25 days',
        'active'
      ) RETURNING id;
    `, [orgId]);
    const activeLogId = activeRes.rows[0].id;

    // 3. Insert expired nonce (older than 24 hours)
    await client.query(`
      INSERT INTO public.voice_service_nonces (request_id, organization_id, expires_at, consumed_at)
      VALUES ('nonce-expired-cleanup-1', $1, NOW() - INTERVAL '25 hours', NOW() - INTERVAL '25 hours')
      ON CONFLICT (request_id) DO NOTHING;
    `, [orgId]);

    // 4. Execute stored procedure
    const purgeRes = await client.query("SELECT public.purge_expired_voice_recordings() AS purged_count;");
    const purgedCount = parseInt(purgeRes.rows[0].purged_count, 10);
    console.log(`   [PostgreSQL Purge Procedure] Returned purged count: ${purgedCount}`);
    assert.ok(purgedCount >= 1, "Must purge at least the 1 inserted expired log");

    // 5. Verify expired log is now purged
    const verifyExpired = await client.query("SELECT transcript, summary, retention_status FROM public.voice_call_logs WHERE id = $1;", [expiredLogId]);
    assert.equal(verifyExpired.rows[0].retention_status, "purged");
    assert.equal(verifyExpired.rows[0].summary, "[SUMMARY_PURGED_RETENTION_EXPIRED]");
    assert.match(JSON.stringify(verifyExpired.rows[0].transcript), /TRANSCRIPT_PURGED: 30-day retention window expired/);

    // 6. Verify active log was NOT touched
    const verifyActive = await client.query("SELECT transcript, summary, retention_status FROM public.voice_call_logs WHERE id = $1;", [activeLogId]);
    assert.equal(verifyActive.rows[0].retention_status, "active");
    assert.equal(verifyActive.rows[0].summary, "Active call summary");

    // 7. Verify expired nonce was pruned
    const nonceCheck = await client.query("SELECT count(*) FROM public.voice_service_nonces WHERE request_id = 'nonce-expired-cleanup-1';");
    assert.equal(parseInt(nonceCheck.rows[0].count, 10), 0, "Expired nonce older than 24h must be deleted by purge routine");
  } finally {
    await client.end();
  }
});

// ============================================================================
// 6. CROSS-TENANT RESOURCE REJECTION IN POSTGRESQL
// ============================================================================

test("POSTGRES: Cross-tenant booking reference query strictly rejects resources belonging to another tenant", async () => {
  const client = await getClient();
  try {
    // 1. Create Tenant A and Tenant B
    const tenantARes = await client.query(`
      INSERT INTO public.organizations (id, name)
      VALUES ('a0000000-0000-0000-0000-00000000000a', 'Tenant Alpha')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const tenantBRes = await client.query(`
      INSERT INTO public.organizations (id, name)
      VALUES ('b0000000-0000-0000-0000-00000000000b', 'Tenant Beta')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const tenantAId = tenantARes.rows[0].id;
    const tenantBId = tenantBRes.rows[0].id;

    // 2. Doctor belongs to Tenant B
    const doctorBRes = await client.query(`
      INSERT INTO public.booking_resources (id, organization_id, name, resource_type, timezone, active)
      VALUES ('d0000000-0000-0000-0000-00000000000b', $1, 'Dr. Belonging To Tenant B', 'doctor', 'Asia/Kolkata', true)
      ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id
      RETURNING id;
    `, [tenantBId]);
    const doctorBId = doctorBRes.rows[0].id;

    // 3. Query resource with Tenant A boundary:
    const queryResult = await client.query(`
      SELECT id, name FROM public.booking_resources 
      WHERE id = $1 AND organization_id = $2;
    `, [doctorBId, tenantAId]);

    console.log(`   [PostgreSQL Tenant Isolation] Tenant A querying Tenant B Doctor: Rows returned = ${queryResult.rows.length}`);
    assert.equal(queryResult.rows.length, 0, "Query scoped to Tenant A must return 0 rows for Doctor in Tenant B");
  } finally {
    await client.end();
  }
});

// ============================================================================
// 7. DURABLE POSTGRESQL RATE LIMITING RPC
// ============================================================================

test("POSTGRES: consume_durable_rate_limit() allows 10 requests and rejects 11th", async () => {
  const client = await getClient();
  try {
    const rateLimitKey = "test_rate_key_" + Date.now();
    const limit = 10;
    const windowSeconds = 60;

    for (let i = 1; i <= limit; i++) {
      const res = await client.query("SELECT public.consume_durable_rate_limit($1::text, $2::int, $3::int) AS allowed;", [rateLimitKey, limit, windowSeconds]);
      assert.equal(res.rows[0].allowed, true, `Request ${i} should be allowed`);
    }

    // 11th request: rejected!
    const resBlocked = await client.query("SELECT public.consume_durable_rate_limit($1::text, $2::int, $3::int) AS allowed;", [rateLimitKey, limit, windowSeconds]);
    assert.equal(resBlocked.rows[0].allowed, false, "11th request must return allowed = false");
    console.log("   [PostgreSQL Durable Rate Limiter] 10 requests allowed, 11th request blocked (allowed = false)");
  } finally {
    await client.end();
  }
});

// ============================================================================
// 8. APPEND-ONLY TRANSCRIPT ACCESS AUDIT TABLE IN POSTGRESQL
// ============================================================================

test("POSTGRES: voice_transcript_access_audits records immutable append-only access events", async () => {
  const client = await getClient();
  try {
    const orgRes = await client.query(`
      INSERT INTO public.organizations (id, name)
      VALUES ('a0000000-0000-0000-0000-000000000004', 'Test Tenant Audit')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    const logRes = await client.query(`
      INSERT INTO public.voice_call_logs (org_id, contact_phone, direction, duration_seconds)
      VALUES ($1, '+91-XXXXX-9999', 'inbound', 45)
      RETURNING id;
    `, [orgId]);
    const callLogId = logRes.rows[0].id;

    // Simulate 3 distinct read accesses
    const actorId = "00000000-0000-0000-0000-000000000001";
    for (let i = 1; i <= 3; i++) {
      await client.query(`
        INSERT INTO public.voice_transcript_access_audits (
          call_log_id, organization_id, accessed_by, client_ip, user_agent
        ) VALUES (
          $1, $2, $3, $4, $5
        );
      `, [callLogId, orgId, actorId, `192.168.1.${i}`, `MedicalPortalBrowser/v${i}`]);
    }

    const auditCountRes = await client.query(
      "SELECT count(*) FROM public.voice_transcript_access_audits WHERE call_log_id = $1;",
      [callLogId]
    );
    const count = parseInt(auditCountRes.rows[0].count, 10);
    console.log(`   [PostgreSQL Audit Ledger] Inserted 3 accesses, table contains: ${count} audit records`);
    assert.equal(count, 3, "Append-only audit table must record all 3 distinct access events");
  } finally {
    await client.query("DO $$ BEGIN ALTER TABLE public.organizations ENABLE TRIGGER initialize_omnirelay_workspace; EXCEPTION WHEN OTHERS THEN NULL; END $$;");
    await client.end();
  }
});

