import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

// ============================================================================
// 1. PIN Validation & Zero-Storage / Privacy Tests
// ============================================================================

test("strict PIN validation: exactly 6 numeric digits required, invalid values rejected", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");

  // Server-side strict regex check: exactly 6 numeric digits
  assert.match(registerRoute, /\/\^\\d\{6\}\$\/\.test\(rawPin\)/);
  assert.match(registerRoute, /Two-step verification PIN must be exactly six numeric digits/);

  // Unit validation of the regex against edge cases
  const pinRegex = /^\d{6}$/;
  assert.strictEqual(pinRegex.test("123456"), true);
  assert.strictEqual(pinRegex.test("000000"), true);
  assert.strictEqual(pinRegex.test("999999"), true);
  assert.strictEqual(pinRegex.test("12345"), false, "Must reject 5 digits");
  assert.strictEqual(pinRegex.test("1234567"), false, "Must reject 7 digits");
  assert.strictEqual(pinRegex.test("abcdef"), false, "Must reject non-numeric characters");
  assert.strictEqual(pinRegex.test("12a456"), false, "Must reject mixed alphanumeric");
  assert.strictEqual(pinRegex.test(" 123456"), false, "Must reject leading spaces");
  assert.strictEqual(pinRegex.test("123456 "), false, "Must reject trailing spaces");
  assert.strictEqual(pinRegex.test(""), false, "Must reject empty string");
});

test("PINs are never logged, returned, or permanently stored in database", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");

  // Verify PIN is not logged in console
  assert.doesNotMatch(registerRoute, /console\.(log|error|warn|info)\(.*pin/i, "PIN must never be logged to console");

  // Verify PIN is not inserted or updated in Supabase database tables
  assert.doesNotMatch(registerRoute, /\.update\(\{[^}]*pin/i, "PIN must not be stored in update calls");
  assert.doesNotMatch(registerRoute, /\.insert\(\{[^}]*pin/i, "PIN must not be stored in insert calls");

  // Verify PIN is not returned in API responses
  assert.doesNotMatch(registerRoute, /NextResponse\.json\(\{[^}]*pin/i, "PIN must not be returned in responses");
});

// ============================================================================
// 2. Vault-backed Token Storage & Security Definer RPC
// ============================================================================

test("Meta access tokens are retrieved from Vault RPC and not stored in organizations_addresses.extra", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");
  const migrationSql = await readFile(new URL("supabase/migrations/20261027200000_whatsapp_registration_vault_and_status.sql", root), "utf8");

  // Route retrieves token from Vault via get_whatsapp_access_token RPC
  assert.match(registerRoute, /createAdminClient\(\)/);
  assert.match(registerRoute, /get_whatsapp_access_token/);
  assert.match(registerRoute, /p_organization_id:\s*organization\.id/);
  assert.match(registerRoute, /p_phone_number_id:\s*targetPhoneId/);

  // Migration defines public.get_whatsapp_access_token and public.store_whatsapp_access_token
  assert.match(migrationSql, /create or replace function public\.store_whatsapp_access_token/i);
  assert.match(migrationSql, /create or replace function public\.get_whatsapp_access_token/i);
  assert.match(migrationSql, /revoke all on function public\.get_whatsapp_access_token/i);
  assert.match(migrationSql, /grant execute on function public\.get_whatsapp_access_token.*to service_role/i);
  assert.match(migrationSql, /extra\s*=\s*extra\s*-\s*'access_token'/i);
});

// ============================================================================
// 3. Exact Phone Number ID Scoping & Tenant Isolation
// ============================================================================

test("Scope: every connection lookup and update is scoped to external_phone_number_id", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");
  const signupRoute = await readFile(new URL("app/api/whatsapp/embedded-signup/route.ts", root), "utf8");

  // Register route scopes connection queries and updates to external_phone_number_id
  assert.match(registerRoute, /\.eq\("external_phone_number_id",\s*targetPhoneId\)/);
  assert.match(registerRoute, /\.eq\("organization_id",\s*organization\.id\)/);

  // Embedded signup route scopes to external_phone_number_id
  assert.match(signupRoute, /external_phone_number_id:\s*payload\.phoneNumberId/);
});

// ============================================================================
// 4. Rate Limiting, Cooldown & Audit Events
// ============================================================================

test("Rate limiting & cooldown: enforces 30s cooldown and logs audit event without PIN", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");

  // Cooldown window of 30,000ms
  assert.match(registerRoute, /COOLDOWN_MS\s*=\s*30_000/);
  assert.match(registerRoute, /last_registration_attempt_at/);
  assert.match(registerRoute, /status:\s*429/);
  assert.match(registerRoute, /"Retry-After"/);

  // Audit event logged for attempt and failure without PIN
  assert.match(registerRoute, /action:\s*"WHATSAPP_REGISTRATION_ATTEMPT"/);
  assert.match(registerRoute, /action:\s*"WHATSAPP_REGISTRATION_SUCCESS"/);
  assert.match(registerRoute, /action:\s*"WHATSAPP_REGISTRATION_FAILED"/);
});

// ============================================================================
// 5. Meta Status Confirmation (New-number and Coexistence)
// ============================================================================

test("Meta status confirmation: new numbers require registration and only become live when CONNECTED", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");
  const signupRoute = await readFile(new URL("app/api/whatsapp/embedded-signup/route.ts", root), "utf8");

  // Embedded signup marks new numbers as pending_registration
  assert.match(signupRoute, /initialStatus\s*=\s*"pending_registration"/);

  // For coexistence, embedded signup confirms Meta status before marking live
  assert.match(signupRoute, /metaStatus\s*===\s*"CONNECTED"\s*\|\|\s*metaVerify\s*===\s*"VERIFIED"/);

  // Register route verifies metaStatus === "CONNECTED" before setting connected
  assert.match(registerRoute, /if\s*\(metaStatus\s*===\s*"CONNECTED"\)\s*\{[\s\S]*status:\s*"connected"/);
  assert.match(registerRoute, /success:\s*false,\s*status:\s*"pending_registration"/);
});

// ============================================================================
// 6. Database Failure & Reconciliation State
// ============================================================================

test("Database failure handling: returns reconciliation_required state and logs alert if DB update fails after Meta succeeds", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");
  const signupRoute = await readFile(new URL("app/api/whatsapp/embedded-signup/route.ts", root), "utf8");

  // Checks update results and returns reconciliation_required on failure
  assert.match(registerRoute, /updateConnError\s*\|\|\s*!updatedConns\s*\|\|\s*updatedConns\.length\s*===\s*0/);
  assert.match(registerRoute, /status:\s*"reconciliation_required"/);
  assert.match(registerRoute, /reconciliationRequired:\s*true/);
  assert.match(registerRoute, /category:\s*"reconciliation_alert"/);

  // Signup route also handles DB failure with reconciliation alert
  assert.match(signupRoute, /connError\s*\|\|\s*!connectionRows\s*\|\|\s*connectionRows\.length\s*===\s*0/);
  assert.match(signupRoute, /reconciliationRequired:\s*true/);
});

// ============================================================================
// 7. Route Authorization & Authentication Guards
// ============================================================================

test("Route guards: requires staging guard, authentication, and owner authorization", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");

  // Staging guard
  assert.match(registerRoute, /isWhatsAppStagingAllowed\(\)/);

  // Unauthenticated user -> 401
  assert.match(registerRoute, /if\s*\(!user\)\s*\{\s*return\s*NextResponse\.json\(\{\s*error:\s*"Sign in required\."\s*\},\s*\{\s*status:\s*401\s*\}\);/);

  // Non-owner actor -> 403
  assert.match(registerRoute, /Only the workspace owner can complete WhatsApp registration/);
  assert.match(registerRoute, /status:\s*403/);

  // Tenant isolation & wrong phone ID -> 404
  assert.match(registerRoute, /WhatsApp connection not found for this workspace and phone number ID/);
  assert.match(registerRoute, /status:\s*404/);
});

// ============================================================================
// 8. Meta Failure Handling & Safe Retry
// ============================================================================

test("Meta failure: returns sanitized error, preserves pending_registration, and allows retry", async () => {
  const registerRoute = await readFile(new URL("app/api/whatsapp/register/route.ts", root), "utf8");

  assert.match(registerRoute, /if\s*\(!registerResponse\.ok\)\s*\{/);
  assert.match(registerRoute, /status:\s*"pending_registration"/);
  assert.match(registerRoute, /allowRetry:\s*true/);
  assert.match(registerRoute, /sanitizedError/);
});

// ============================================================================
// 9. UI Display & Secure PIN Form
// ============================================================================

test("UI displays pending_registration and provides secure six-digit PIN form", async () => {
  const connectComp = await readFile(new URL("app/app/integrations/whatsapp-connect.tsx", root), "utf8");

  assert.match(connectComp, /connectionStatus\s*===\s*"pending_registration"/);
  assert.match(connectComp, /ACTION REQUIRED · OWNER ONLY/);
  assert.match(connectComp, /Complete WhatsApp Registration/);
  assert.match(connectComp, /type="password"/);
  assert.match(connectComp, /inputMode="numeric"/);
  assert.match(connectComp, /maxLength=\{6\}/);
  assert.match(connectComp, /pattern="\[0-9\]\{6\}"/);
  assert.match(connectComp, /autoComplete="new-password"/);
  assert.match(connectComp, /setPin\(""\)/, "PIN state wiped immediately in finally block");
});
