import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isWhatsAppStagingAllowed, STAGING_PROJECT_REF, STAGING_CALLBACK_URL } from "../lib/whatsapp-staging-guard.ts";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = "https://dwkwxrcuycsqiviozgtl.supabase.co";

test("STAGING_CALLBACK_URL points to the exact staging project webhook", () => {
  assert.equal(STAGING_CALLBACK_URL, "https://sqcprlkhsnfbydgzpsml.supabase.co/functions/v1/whatsapp-webhook");
});

test("allows TARGET_ENV=staging with exact staging Supabase when VERCEL_ENV=production", () => {
  const allowed = isWhatsAppStagingAllowed({
    targetEnv: "staging",
    supabaseUrl: STAGING_URL,
    vercelEnv: "production"
  });
  assert.equal(allowed, true, "Explicit TARGET_ENV=staging must be allowed on Vercel production deployment target");
});

test("allows TARGET_ENV=staging with exact staging Supabase in preview or undefined vercelEnv", () => {
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: STAGING_URL, vercelEnv: "preview" }), true);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: STAGING_URL, vercelEnv: undefined }), true);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "STAGING ", supabaseUrl: STAGING_URL, vercelEnv: "production" }), true, "case and whitespace insensitive");
});

test("fails closed when TARGET_ENV is missing or empty", () => {
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "", supabaseUrl: STAGING_URL, vercelEnv: "production" }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: undefined, supabaseUrl: STAGING_URL, vercelEnv: "preview" }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "   ", supabaseUrl: STAGING_URL, vercelEnv: "production" }), false);
});

test("fails closed when TARGET_ENV is production", () => {
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "production", supabaseUrl: STAGING_URL, vercelEnv: "production" }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "production", supabaseUrl: STAGING_URL, vercelEnv: "preview" }), false);
});

test("fails closed when TARGET_ENV is non-staging value", () => {
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "development", supabaseUrl: STAGING_URL }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "local", supabaseUrl: STAGING_URL }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "test", supabaseUrl: STAGING_URL }), false);
});

test("fails closed when Supabase hostname is production Supabase", () => {
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: PROD_URL, vercelEnv: "production" }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: PROD_URL, vercelEnv: "preview" }), false);
});

test("fails closed when Supabase hostname is invalid, malformed, or arbitrary domain", () => {
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: "", vercelEnv: "production" }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: "not-a-url", vercelEnv: "production" }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: "https://sqcprlkhsnfbydgzpsml.other.co", vercelEnv: "production" }), false);
  assert.equal(isWhatsAppStagingAllowed({ targetEnv: "staging", supabaseUrl: "https://evil-sqcprlkhsnfbydgzpsml.supabase.co", vercelEnv: "production" }), false);
});

test("both WhatsApp routes use isWhatsAppStagingAllowed guard", async () => {
  const root = new URL("../", import.meta.url);
  const onboardingRoute = await readFile(new URL("app/api/whatsapp/onboarding-session/route.ts", root), "utf8");
  const embeddedRoute = await readFile(new URL("app/api/whatsapp/embedded-signup/route.ts", root), "utf8");

  assert.match(onboardingRoute, /isWhatsAppStagingAllowed\(\)/);
  assert.match(embeddedRoute, /isWhatsAppStagingAllowed\(\)/);
});
