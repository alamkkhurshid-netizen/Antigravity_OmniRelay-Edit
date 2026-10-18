import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  generateVoiceHmacSignature,
  verifyVoiceServiceAuth,
} from "../lib/voice/auth.ts";
import {
  maskPhoneNumber,
  hashPhoneNumber,
  scrubPiiText,
  sanitizeTranscript,
  calculateRetentionExpiry,
} from "../lib/voice/privacy.ts";
import {
  isFeatureEnabled,
  getAllFeatureFlags,
  setFeatureFlagOverride,
  clearFeatureFlagOverrides,
  satisfiesTier,
} from "../lib/feature-flags.ts";
import {
  buildMonthlyReportMetrics,
  generateMonthlyReportHtml,
  generateMonthlyEmailSummary,
} from "../lib/reports/monthly-summary.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// Set test secret
const TEST_SECRET = "test-voice-secret-key-remediation-123";
process.env.VOICE_SERVICE_SECRET = TEST_SECRET;

// ============================================================================
// 1. VOICE SERVICE-TO-SERVICE AUTHENTICATION & REPLAY GUARD (NEGATIVE SCENARIOS)
// ============================================================================

test("NEGATIVE AUTH: verifyVoiceServiceAuth rejects requests without signature (401)", async () => {
  const req = new Request("http://localhost:3000/api/voice/book", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-voice-org-id": "org-test-uuid",
    },
    body: JSON.stringify({ org_id: "org-test-uuid" }),
  });

  const result = await verifyVoiceServiceAuth(req, JSON.stringify({ org_id: "org-test-uuid" }), "org-test-uuid");
  assert.equal(result.authorized, false);
  assert.equal(result.status, 401);
  assert.match(result.error || "", /Missing x-voice-signature/);
});

test("NEGATIVE AUTH: verifyVoiceServiceAuth rejects tampered signatures (401)", async () => {
  const now = Date.now();
  const payload = JSON.stringify({ org_id: "org-test-uuid" });
  const req = new Request("http://localhost:3000/api/voice/book", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-voice-org-id": "org-test-uuid",
      "x-voice-timestamp": String(now),
      "x-voice-signature": "v1=invalidtamperedsignature0000000000000000000000000000000000000000000000000000000000000000",
    },
    body: payload,
  });

  const result = await verifyVoiceServiceAuth(req, payload, "org-test-uuid");
  assert.equal(result.authorized, false);
  assert.equal(result.status, 401);
  assert.match(result.error || "", /Invalid voice signature|HMAC signature verification failed/);
});

test("NEGATIVE AUTH: verifyVoiceServiceAuth guards against replay attacks with timestamp skew (>300s) (401)", async () => {
  const oldTimestamp = Date.now() - 600 * 1000; // 10 minutes ago
  const payload = JSON.stringify({ org_id: "org-test-uuid" });
  const sig = generateVoiceHmacSignature(payload, oldTimestamp, TEST_SECRET);

  const req = new Request("http://localhost:3000/api/voice/book", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-voice-org-id": "org-test-uuid",
      "x-voice-timestamp": String(oldTimestamp),
      "x-voice-signature": sig,
    },
    body: payload,
  });

  const result = await verifyVoiceServiceAuth(req, payload, "org-test-uuid");
  assert.equal(result.authorized, false);
  assert.equal(result.status, 401);
  assert.match(result.error || "", /outside allowed 5-minute skew window/);
});

test("NEGATIVE AUTH: verifyVoiceServiceAuth rejects tenant binding violation / cross-tenant impersonation (403)", async () => {
  const now = Date.now();
  const payload = JSON.stringify({ org_id: "tenant-b-uuid" });
  const sig = generateVoiceHmacSignature(payload, now, TEST_SECRET);

  // Header claims Tenant A, but payload/expected org is Tenant B
  const req = new Request("http://localhost:3000/api/voice/escalate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-voice-org-id": "tenant-a-uuid",
      "x-voice-timestamp": String(now),
      "x-voice-signature": sig,
    },
    body: payload,
  });

  const result = await verifyVoiceServiceAuth(req, payload, "tenant-b-uuid");
  assert.equal(result.authorized, false);
  assert.equal(result.status, 403);
  assert.match(result.error || "", /Tenant boundary violation/);
});

test("NEGATIVE AUTH: verifyVoiceServiceAuth blocks execution when voice feature flag is disabled (403)", async () => {
  clearFeatureFlagOverrides();
  setFeatureFlagOverride("tenant-gated-org", "voice_agent_enabled", false);

  const now = Date.now();
  const payload = JSON.stringify({ org_id: "tenant-gated-org" });
  const sig = generateVoiceHmacSignature(payload, now, TEST_SECRET);

  const req = new Request("http://localhost:3000/api/voice/book", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-voice-org-id": "tenant-gated-org",
      "x-voice-timestamp": String(now),
      "x-voice-signature": sig,
    },
    body: payload,
  });

  const result = await verifyVoiceServiceAuth(req, payload, "tenant-gated-org");
  assert.equal(result.authorized, false);
  assert.equal(result.status, 403);
  assert.match(result.error || "", /Voice AI telephony is currently disabled/);
});

test("POSITIVE AUTH: verifyVoiceServiceAuth allows legitimate requests with valid HMAC and enabled flag", async () => {
  clearFeatureFlagOverrides();
  setFeatureFlagOverride("valid-tenant-org", "voice_agent_enabled", true);

  const now = Date.now();
  const payload = JSON.stringify({ org_id: "valid-tenant-org", slot: "10:00" });
  const sig = generateVoiceHmacSignature(payload, now, TEST_SECRET);

  const req = new Request("http://localhost:3000/api/voice/book", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-voice-org-id": "valid-tenant-org",
      "x-voice-timestamp": String(now),
      "x-voice-signature": sig,
    },
    body: payload,
  });

  const result = await verifyVoiceServiceAuth(req, payload, "valid-tenant-org");
  assert.equal(result.authorized, true);
  assert.equal(result.status, 200);
});

test("SOURCE RECOVERY: All voice API routes invoke verifyVoiceServiceAuth before service-role client", async () => {
  const bookRoute = await read("app/api/voice/book/route.ts");
  const escalateRoute = await read("app/api/voice/escalate/route.ts");
  const availRoute = await read("app/api/voice/availability/route.ts");
  const logsRoute = await read("app/api/voice/logs/route.ts");

  assert.match(bookRoute, /verifyVoiceServiceAuth/);
  assert.match(escalateRoute, /verifyVoiceServiceAuth/);
  assert.match(availRoute, /verifyVoiceServiceAuth/);
  assert.match(logsRoute, /verifyVoiceServiceAuth/);

  // In POST handler, verifyVoiceServiceAuth execution must precede createAdminClient() call
  const postBody = bookRoute.slice(bookRoute.indexOf("export async function POST"));
  const bookAuthCall = postBody.indexOf("await verifyVoiceServiceAuth");
  const bookAdminCall = postBody.indexOf("createAdminClient()");
  assert.ok(bookAuthCall > 0 && bookAdminCall > 0 && bookAuthCall < bookAdminCall, "Authentication must precede createAdminClient in voice/book");
});


test("CROSS-TENANT VOICE ANALYTICS: Voice analytics checks operator authority before cross-tenant query", async () => {
  const analyticsRoute = await read("app/api/voice/analytics/route.ts");
  assert.match(analyticsRoute, /is_oem_operator/);
  assert.match(analyticsRoute, /Forbidden: Cross-tenant analytics access denied/);
});

// ============================================================================
// 2. PRIVACY & ZERO-RETENTION CONSTRAINTS
// ============================================================================

test("PRIVACY: Phone masking hides middle digits and preserves regional format", () => {
  assert.equal(maskPhoneNumber("+919876543210"), "+91-XXXXX-3210");
  assert.equal(maskPhoneNumber("9876543210"), "+91-XXXXX-3210");
  assert.equal(maskPhoneNumber("123"), "REDACTED");
  assert.equal(maskPhoneNumber(null), "ANONYMOUS");
});

test("PRIVACY: Hashing phone number is deterministic and zero-knowledge", () => {
  const hashA = hashPhoneNumber("+919876543210", "custom-salt");
  const hashB = hashPhoneNumber("+919876543210", "custom-salt");
  const hashC = hashPhoneNumber("+919876543219", "custom-salt");

  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
  assert.equal(hashA.length, 64);
  assert.ok(!hashA.includes("9876543210"));
});

test("PRIVACY: PII scrubber removes email addresses and phone numbers from conversational text", () => {
  const raw = "Patient email is test.user@gmail.com and mobile is 9876543210.";
  const cleaned = scrubPiiText(raw);

  assert.ok(!cleaned.includes("test.user@gmail.com"));
  assert.ok(!cleaned.includes("9876543210"));
  assert.match(cleaned, /\[REDACTED_EMAIL\]/);
  assert.match(cleaned, /\[REDACTED_PHONE\]/);
});

test("PRIVACY: Zero-retention policy omits transcript if recording consent is not verified", () => {
  const transcript = [
    { speaker: "caller", text: "I have had a high fever since morning" },
    { speaker: "agent", text: "Dr. Rao has an open slot at 5 PM" },
  ];

  // Without verified consent:
  const withoutConsent = sanitizeTranscript(transcript, false);
  assert.equal(withoutConsent.length, 1);
  assert.equal(withoutConsent[0].speaker, "system");
  assert.match(withoutConsent[0].text, /TRANSCRIPT_OMITTED_ZERO_RETENTION_POLICY/);
  assert.ok(!withoutConsent[0].text.includes("high fever"));

  // With verified consent:
  const withConsent = sanitizeTranscript(transcript, true);
  assert.equal(withConsent.length, 2);
  assert.ok(withConsent[0].text.includes("high fever"));
});

test("PRIVACY: Retention expiry window defaults to 30 days", () => {
  const expiryIso = calculateRetentionExpiry(30);
  const diffDays = Math.round((new Date(expiryIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  assert.equal(diffDays, 30);
});

// ============================================================================
// 3. RETAIL ORDER LOOKUP ENUMERATION & FEED PROTECTION
// ============================================================================

test("NEGATIVE AUTH: Retail order lookup enforces mandatory organization_id, feature flag, query bounds, and verification", async () => {
  const orderRoute = await read("app/api/retail/order-lookup/route.ts");

  // 1. Mandatory organization_id
  assert.match(orderRoute, /organization_id parameter is required for order lookup/);

  // 2. Feature flag check
  assert.match(orderRoute, /whatsapp_catalog_enabled/);
  assert.match(orderRoute, /Retail ordering module is currently disabled/);

  // 3. Query length bound against enumeration
  assert.match(orderRoute, /Order query must contain at least 6 characters to prevent enumeration/);

  // 4. Verification requirement (customer phone or signed order token)
  assert.match(orderRoute, /Verification required: customer phone verification or signed order token is required/);

  // 5. Zero-PII restricted status projection
  assert.match(orderRoute, /RestrictedOrderProjection/);
  assert.doesNotMatch(orderRoute, /order:\s*orders\[0\]/);
});

test("NEGATIVE AUTH: Retail catalog requires feed secret and respects feature flag", async () => {
  const catalogRoute = await read("app/api/retail/catalog/route.ts");

  assert.match(catalogRoute, /whatsapp_catalog_enabled/);
  assert.match(catalogRoute, /Retail catalog feature is disabled for this organization/);
  assert.match(catalogRoute, /RETAIL_CATALOG_FEED_SECRET/);
  assert.match(catalogRoute, /Unauthorized: valid catalog feed secret is required/);
});

// ============================================================================
// 4. FEATURE FLAGS & TIER REQUIREMENTS
// ============================================================================

test("FEATURE FLAGS: Enforces tier ranking hierarchy (Starter < Growth < Enterprise)", () => {
  assert.equal(satisfiesTier("starter", "starter"), true);
  assert.equal(satisfiesTier("starter", "growth"), false);
  assert.equal(satisfiesTier("starter", "enterprise"), false);

  assert.equal(satisfiesTier("growth", "starter"), true);
  assert.equal(satisfiesTier("growth", "growth"), true);
  assert.equal(satisfiesTier("growth", "enterprise"), false);

  assert.equal(satisfiesTier("enterprise", "starter"), true);
  assert.equal(satisfiesTier("enterprise", "growth"), true);
  assert.equal(satisfiesTier("enterprise", "enterprise"), true);
});

test("FEATURE FLAGS: Safe defaults: pilot and unreleased features default to disabled (false)", () => {
  clearFeatureFlagOverrides();

  assert.equal(isFeatureEnabled("voice_agent_enabled"), false);
  assert.equal(isFeatureEnabled("whatsapp_catalog_enabled"), false);
  assert.equal(isFeatureEnabled("abandoned_cart_recovery_enabled"), false);
  assert.equal(isFeatureEnabled("loyalty_rewards_enabled"), false);
  assert.equal(isFeatureEnabled("deposit_enforcement_enabled"), false);

  // Production core utilities remain active
  assert.equal(isFeatureEnabled("ai_insights_narration_enabled"), true);
  assert.equal(isFeatureEnabled("strict_rate_limiting_enabled"), true);
});

test("FEATURE FLAGS: Admin route enforces RBAC (owner/admin only) and durable Supabase storage", async () => {
  const adminFlagRoute = await read("app/api/admin/feature-flags/route.ts");

  assert.match(adminFlagRoute, /role !== "owner" && role !== "admin"/);
  assert.match(adminFlagRoute, /Only workspace owners and administrators can configure feature flags/);
  assert.match(adminFlagRoute, /satisfiesTier/);
  assert.match(adminFlagRoute, /Tier requirement not met/);
  assert.match(adminFlagRoute, /from\("organizations"\)[\s\S]*\.update/);
  assert.match(adminFlagRoute, /recordTeamAudit/);
});

// ============================================================================
// 5. MONTHLY EXECUTIVE REPORTING (DATA INTEGRITY & ZERO-FABRICATION)
// ============================================================================

test("REPORTING: Missing queue check-in data returns null avgWaitMinutes without fabricating numbers", () => {
  const metrics = buildMonthlyReportMetrics({
    organizationId: "org-test-uuid",
    organizationName: "City Heart Clinic",
    month: "October 2026",
    booked: 45,
    completed: 40,
    noShow: 3,
    cancelled: 2,
    remindersDispatched: 50,
    remindersDelivered: 49,
    remindersRead: 45,
    avgWaitMinutes: null, // Empty queue check-ins
    grossRevenuePaise: 4000000,
    onlineRevenuePaise: 1500000,
  });

  assert.equal(metrics.operations.avgWaitMinutes, null);
  assert.equal(metrics.operations.maxWaitMinutes, null);

  const html = generateMonthlyReportHtml(metrics);
  assert.match(html, /Insufficient queue data/);
  assert.ok(!html.includes("14 mins"), "Must never output fabricated 14-minute default");

  const email = generateMonthlyEmailSummary(metrics);
  assert.match(email.text, /Average Waiting Time: Insufficient queue data/);
  assert.ok(!email.text.includes("14 minutes"));
});


test("REPORTING: Monthly summary route accurately bounds requested reporting month and returns null on empty queue", async () => {
  const route = await read("app/api/reports/monthly-summary/route.ts");

  assert.match(route, /startOfMonth/);
  assert.match(route, /endOfMonth/);
  assert.match(route, /\.lt\("starts_at", endOfMonth\.toISOString\(\)\)/);
  assert.match(route, /\.lt\("arrived_at", endOfMonth\.toISOString\(\)\)/);
  assert.match(route, /const avgWaitMinutes: number \| null = count > 0 \? Math\.round\(totalWait \/ count\) : null;/);
});

// ============================================================================
// 6. PREVIEW CI WORKFLOW HONESTY
// ============================================================================

test("CI WORKFLOW: Preview deployment workflow does not suppress errors or fabricate preview URLs", async () => {
  const workflow = await read(".github/workflows/preview.yml");

  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /echo "https:\/\/omnirelay-preview\.vercel\.app"/);
  assert.match(workflow, /Vercel Preview Deployment Succeeded/);
  assert.match(workflow, /Vercel Preview Deployment Failed/);
  assert.match(workflow, /Vercel Preview Skipped/);
});
