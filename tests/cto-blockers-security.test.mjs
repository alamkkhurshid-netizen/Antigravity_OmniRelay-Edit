import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("CTO Blockers Verification: Razorpay Webhook Fail-Closed & Amount Binding", async () => {
  const webhookCode = readFileSync(new URL("../app/api/billing/webhook/route.ts", import.meta.url), "utf8");
  const topupCode = readFileSync(new URL("../app/api/billing/razorpay-topup/route.ts", import.meta.url), "utf8");

  // 1. Fail closed: verification required unconditionally in all environments
  assert.doesNotMatch(webhookCode, /if\s*\(process\.env\.NODE_ENV\s*===\s*"production"\s*&&\s*secret\)/, "Must not bypass signature in non-production");
  assert.match(webhookCode, /RAZORPAY_WEBHOOK_SECRET/, "Must require RAZORPAY_WEBHOOK_SECRET");
  assert.match(webhookCode, /crypto\.timingSafeEqual/, "Must use timingSafeEqual for signature check");

  // 2. Pre-registered order binding & amount tampering check
  assert.match(webhookCode, /pendingOrder/, "Must look up pre-registered order from database");
  assert.match(webhookCode, /PAYMENT_AMOUNT_MISMATCH/, "Must detect and record amount tampering attempts");

  // 3. Razorpay top-up fail closed without synthetic order fallback in production
  assert.match(topupCode, /Payment gateway network error|Failed to create payment order/, "Must fail closed on gateway errors");
  assert.match(topupCode, /wallet_transactions/, "Must persist pending transaction row on order creation");
});

test("CTO Blockers Verification: Google Calendar Signed Nonce & Safe Upsert", async () => {
  const authRoute = readFileSync(new URL("../app/api/auth/google-calendar/route.ts", import.meta.url), "utf8");
  const callbackRoute = readFileSync(new URL("../app/api/auth/google-calendar/callback/route.ts", import.meta.url), "utf8");

  // 1. Authenticated admin initiation
  assert.match(authRoute, /supabase\.auth\.getUser\(\)/, "Must authenticate user session before OAuth initiation");
  assert.match(authRoute, /is_organization_member/, "Must verify admin membership before generating OAuth URL");

  // 2. Cryptographic signed state with expiration and nonce
  assert.match(authRoute, /crypto\.createHmac/, "State must be cryptographically signed with HMAC");
  assert.match(authRoute, /nonce:\s*crypto\.randomUUID\(\)/, "State must contain single-use nonce");
  assert.match(authRoute, /exp:\s*Date\.now\(\)/, "State must contain expiration timestamp");

  // 3. Callback verification
  assert.match(callbackRoute, /crypto\.timingSafeEqual/, "Callback must safely compare state HMAC signature");
  assert.match(callbackRoute, /consumeNonce/, "Callback must consume nonce to prevent replay attacks");
  assert.match(callbackRoute, /refreshTokenToSave/, "Callback must preserve existing refresh token if omitted by Google");
  assert.match(callbackRoute, /resource_id/, "Callback must handle nullable resource_id without conflict errors");
});

test("CTO Blockers Verification: Voice Metering & Creative Webhook Authenticity", async () => {
  const voiceMetering = readFileSync(new URL("../app/api/billing/voice-metering/route.ts", import.meta.url), "utf8");
  const creativeWebhook = readFileSync(new URL("../app/api/creative/webhook/route.ts", import.meta.url), "utf8");

  // 1. Voice metering: fail closed, replay cache, no default fallback secret
  assert.doesNotMatch(voiceMetering, /omnirelay_default_secret_key/, "Must not contain fallback default secret string");
  assert.match(voiceMetering, /VOICE_WEBHOOK_SECRET/, "Must require VOICE_WEBHOOK_SECRET");
  assert.match(voiceMetering, /checkAndRecordReplay/, "Must enforce replay-ID protection");
  assert.match(voiceMetering, /VOICE_ENGINE_API_KEY/, "Must accept only dedicated voice credential");

  // 2. Creative webhook: authentication and persistence error check
  assert.match(creativeWebhook, /CREATIVE_WEBHOOK_SECRET/, "Creative webhook must check shared secret");
  assert.match(creativeWebhook, /crypto\.timingSafeEqual/, "Creative webhook must use timing-safe comparison");
  assert.match(creativeWebhook, /updateError/, "Creative webhook must check database update errors before acknowledging");
});
