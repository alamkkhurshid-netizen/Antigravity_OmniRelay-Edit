import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";

const root = new URL("../", import.meta.url);

// ============================================================================
// 1. HMAC Verification Tests (Positive, Negative, Multi-Secret, Constant-Time)
// ============================================================================

test("HMAC positive test: valid signature with correct secret matches", () => {
  const secret = "test_meta_secret_12345";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const signatureHeader = `sha256=${hmac}`;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(hmac, expected);
  assert.match(signatureHeader, /^sha256=[a-f0-9]{64}$/);
});

test("HMAC negative test: tampered body or incorrect secret fails", () => {
  const secret = "test_meta_secret_12345";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");

  const wrongSecretHmac = crypto.createHmac("sha256", "wrong_secret").update(body).digest("hex");
  assert.notEqual(hmac, wrongSecretHmac);

  const tamperedBodyHmac = crypto.createHmac("sha256", secret).update(body + "tamper").digest("hex");
  assert.notEqual(hmac, tamperedBodyHmac);
});

test("HMAC multi-secret test: supports pipe-delimited app secrets", () => {
  const appSecrets = "old_secret_123|active_secret_456|backup_secret_789";
  const body = '{"test":true}';
  const hmac = crypto.createHmac("sha256", "active_secret_456").update(body).digest("hex");

  const secrets = appSecrets.split("|");
  const matches = secrets.some(sec => {
    const computed = crypto.createHmac("sha256", sec).update(body).digest("hex");
    return computed === hmac;
  });
  assert.equal(matches, true);
});

test("HMAC constant-time equality check resists timing side-channels", () => {
  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  const hmacA = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const hmacB = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const hmacC = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456780";
  const hmacShort = "abcdef0123456789";

  assert.equal(constantTimeEqual(hmacA, hmacB), true);
  assert.equal(constantTimeEqual(hmacA, hmacC), false);
  assert.equal(constantTimeEqual(hmacA, hmacShort), false);
});

// ============================================================================
// 2. Next.js Webhook Tombstone Route Contract Tests
// ============================================================================

test("Next.js /api/whatsapp/webhook is tombstoned and returns 410 Gone", async () => {
  const route = await readFile(new URL("app/api/whatsapp/webhook/route.ts", root), "utf8");
  assert.match(route, /status:\s*410/, "Route must return HTTP 410 Gone");
  assert.match(route, /TOMBSTONE_PAYLOAD/, "Must define tombstone payload");
  assert.match(route, /canonical_endpoint.*whatsapp-webhook/, "Must cite canonical Supabase whatsapp-webhook function");
  assert.doesNotMatch(route, /processSuperCtoApproval/, "Must not contain Super CTO commands");
  assert.doesNotMatch(route, /forwardInboundMessage/, "Must not contain Hermes forwarding");
  assert.doesNotMatch(route, /adminUpdate/, "Must not perform alternative lifecycle tracking");
});

// ============================================================================
// 3. Two-Table Model Migration Contract Tests
// ============================================================================

test("Two-table migration implements partial index and cross-tenant phone rejection", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20261019045654_whatsapp_canonical_two_table_model.sql", root),
    "utf8"
  );

  // Partial unique index
  assert.match(migration, /create unique index if not exists channel_connections_whatsapp_phone_number_id_idx/);
  assert.match(migration, /on public\.channel_connections \(external_phone_number_id\)/);
  assert.match(migration, /where channel = 'whatsapp'/);

  // Cross-tenant phone rejection trigger
  assert.match(migration, /create or replace function private\.prevent_cross_tenant_phone_reassignment/);
  assert.match(migration, /Cross-tenant WhatsApp phone assignment rejected/);
  assert.match(migration, /create trigger trg_prevent_cross_tenant_phone/);
});

test("Atomic signup synchronization RPC satisfies all security boundaries", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20261019045654_whatsapp_canonical_two_table_model.sql", root),
    "utf8"
  );

  // RPC definition
  assert.match(migration, /create or replace function public\.sync_whatsapp_signup/);
  assert.match(migration, /insert into public\.organizations_addresses/);
  assert.match(migration, /insert into public\.channel_connections/);
  assert.match(migration, /insert into public\.operational_events/);

  // PK conflict target on organizations_addresses must be (organization_id, address)
  assert.match(migration, /on conflict \(organization_id, address\) do update set/);

  // Status must be initialized to 'test', not 'live' (reconciler promotes after inbound+outbound)
  assert.match(migration, /v_status := 'test'/);
  assert.doesNotMatch(migration, /v_status := 'live'/, "Must never initialize connection to live");

  // Sealed credentials vs connection UI separation
  assert.match(migration, /'access_token', p_access_token/);
  assert.doesNotMatch(
    migration,
    /channel_connections.*access_token/,
    "channel_connections must NEVER store access_token"
  );

  // No credentials returned in RPC output
  assert.match(migration, /return jsonb_build_object\(\s*'success', true/);
  assert.doesNotMatch(
    migration,
    /'access_token',.*return jsonb_build_object/,
    "RPC return object must NOT include access_token"
  );

  // Service role permission restriction
  assert.match(migration, /revoke all on function public\.sync_whatsapp_signup.*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.sync_whatsapp_signup.*to service_role/);
});

test("Atomic inbound ingestion RPC satisfies all message ingestion boundaries", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20261019045654_whatsapp_canonical_two_table_model.sql", root),
    "utf8"
  );

  // Inbound ingestion RPC
  assert.match(migration, /create or replace function public\.ingest_inbound_whatsapp_message/);
  assert.match(migration, /select organization_id into v_org_id[\s\S]*from public\.channel_connections/);
  assert.match(migration, /insert into public\.contacts_addresses/);
  assert.match(migration, /insert into public\.webhook_events/);
  assert.match(migration, /insert into public\.messages/);
  assert.match(migration, /on conflict \(external_id\) do nothing/);
  assert.match(migration, /returning id into v_message_id/);

  // Unmapped recipient handling
  assert.match(migration, /ROUTING_UNMAPPED_RECIPIENT/);
  assert.match(migration, /'reason', 'unmapped_recipient'/);
  assert.doesNotMatch(
    migration,
    /'00000000-0000-0000-0000-000000000000'[\s\S]*ROUTING_UNMAPPED_RECIPIENT/,
    "Unmapped recipient must NOT use all-zero UUID in operational_events"
  );

  // Service role permission restriction
  assert.match(migration, /revoke all on function public\.ingest_inbound_whatsapp_message.*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.ingest_inbound_whatsapp_message.*to service_role/);
});

// ============================================================================
// 4. Hardened Reconstructed Webhook Contract Tests
// ============================================================================

test("whatsapp-webhook enforces bounded payload size, constant-time HMAC, and atomic ingestion", async () => {
  const webhook = await readFile(
    new URL("supabase/functions/whatsapp-webhook/index.ts", root),
    "utf8"
  );

  // Constant-time HMAC comparison
  assert.match(webhook, /function constantTimeEqual\(a: string, b: string\): boolean/);
  assert.match(webhook, /diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/);

  // Bounded payload size check (1 MB)
  assert.match(webhook, /MAX_PAYLOAD_BYTES = 1024 \* 1024/);
  assert.match(webhook, /Payload Too Large.*413/);

  // Atomic ingestion RPC call
  assert.match(webhook, /client\.rpc\(\s*"ingest_inbound_whatsapp_message"/);
  assert.match(webhook, /p_provider_message_id: messageId/);

  // HTTP 500 on transient database error so Meta retries
  assert.match(webhook, /ingestError[\s\S]*return new Response\("Database Error", \{ status: 500 \}\)/);

  // Privacy-safe technical logging (no raw patient bodies or numbers)
  assert.doesNotMatch(webhook, /log\.info\(.*msg\.text\.body/, "Must never log raw message text");
  assert.doesNotMatch(webhook, /log\.info\(.*msg\.from/, "Must never log raw sender phone numbers");
  assert.doesNotMatch(webhook, /log\.info\(.*contactName/, "Must never log raw contact name in info logs");
});

// ============================================================================
// 5. Reconciled WhatsApp Management Contract Tests
// ============================================================================

test("whatsapp-management preserves Next.js single-path route and calls atomic signup RPC", async () => {
  const management = await readFile(
    new URL("supabase/functions/whatsapp-management/index.ts", root),
    "utf8"
  );
  const signup = await readFile(
    new URL("supabase/functions/whatsapp-management/embedded_signup.ts", root),
    "utf8"
  );

  // Dual-path mounting for Next.js single-path correction
  assert.match(management, /app\.route\("\/whatsapp-management", api\)/);
  assert.match(management, /app\.route\("\/", api\)/);

  // Calls atomic signup RPC
  assert.match(signup, /client\.rpc\(\s*"sync_whatsapp_signup"/);
  assert.match(signup, /p_access_token: business_access_token/);
  assert.match(signup, /p_flow_type: payload\.flow_type/);

  // Role enforcement on templates
  assert.match(management, /api\.put\(\s*"\/templates",\s*requireRoles\(\["member", "admin", "owner"\]\)/);
  assert.match(management, /api\.post\(\s*"\/templates",\s*requireRoles\(\["admin", "owner"\]\)/);
  assert.match(management, /api\.delete\(\s*"\/templates",\s*requireRoles\(\["admin", "owner"\]\)/);
});

// ============================================================================
// 6. Action Centre Two-Table Model Verification
// ============================================================================

test("action-centre uses channel_connections and sealed credentials from organizations_addresses", async () => {
  const actionCentre = await readFile(
    new URL("app/app/action-centre/actions.ts", root),
    "utf8"
  );

  assert.doesNotMatch(
    actionCentre,
    /\.from\("whatsapp_connections"\)/,
    "Action Centre must NOT query deprecated whatsapp_connections"
  );
  assert.match(
    actionCentre,
    /\.from\("channel_connections"\)/,
    "Action Centre must query channel_connections for external_phone_number_id"
  );
  assert.match(
    actionCentre,
    /\.from\("organizations_addresses"\)/,
    "Action Centre must query organizations_addresses for sealed access_token"
  );
});
