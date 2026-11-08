export const STAGING_PROJECT_REF = "sqcprlkhsnfbydgzpsml";
export const PROD_PROJECT_REF = "dwkwxrcuycsqiviozgtl";
export const STAGING_CALLBACK_URL = `https://${STAGING_PROJECT_REF}.supabase.co/functions/v1/whatsapp-webhook`;
export const PROD_CALLBACK_URL = `https://${PROD_PROJECT_REF}.supabase.co/functions/v1/whatsapp-webhook`;

export function getWhatsAppWebhookCallbackUrl(rawUrl?: string): string {
  const currentUrl = rawUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  let hostname = "";
  try {
    hostname = new URL(currentUrl).hostname.toLowerCase();
  } catch {
    hostname = "";
  }
  if (hostname === `${PROD_PROJECT_REF}.supabase.co`) {
    return PROD_CALLBACK_URL;
  }
  return STAGING_CALLBACK_URL;
}

export interface WhatsAppRouteGuardEnv {
  targetEnv?: string | undefined;
  supabaseUrl?: string | undefined;
  vercelEnv?: string | undefined;
}

/**
 * Route guard for WhatsApp onboarding endpoints.
 * 
 * Rules:
 * 1. Explicit TARGET_ENV=staging plus exact staging Supabase hostname
 *    is allowed even when Vercel's deployment target sets VERCEL_ENV=production.
 * 2. Explicit TARGET_ENV=production plus exact production Supabase hostname is allowed.
 * 3. Fail closed when TARGET_ENV is missing or any unapproved value.
 * 4. Fail closed when TARGET_ENV and Supabase hostname mismatch (cross-environment prevention).
 */
export function isWhatsAppStagingAllowed(env?: WhatsAppRouteGuardEnv): boolean {
  const rawTarget = env && env.targetEnv !== undefined ? env.targetEnv : process.env.TARGET_ENV;
  const targetEnv = (rawTarget || "").toLowerCase().trim();

  // Fail closed when TARGET_ENV is missing or neither staging nor production
  if (!targetEnv || (targetEnv !== "staging" && targetEnv !== "production")) {
    return false;
  }

  const rawUrl = env && env.supabaseUrl !== undefined
    ? env.supabaseUrl
    : (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "");

  let parsedHostname = "";
  try {
    parsedHostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    parsedHostname = "";
  }

  // Staging: TARGET_ENV must be staging AND hostname must match staging Supabase
  if (targetEnv === "staging" && parsedHostname === `${STAGING_PROJECT_REF}.supabase.co`) {
    return true;
  }

  // Production: TARGET_ENV must be production AND hostname must match production Supabase
  if (targetEnv === "production" && parsedHostname === `${PROD_PROJECT_REF}.supabase.co`) {
    return true;
  }

  // Cross-environment mismatch fails closed
  return false;
}
