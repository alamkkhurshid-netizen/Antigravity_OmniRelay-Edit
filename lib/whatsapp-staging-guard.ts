export const STAGING_PROJECT_REF = "sqcprlkhsnfbydgzpsml";
export const STAGING_CALLBACK_URL = `https://${STAGING_PROJECT_REF}.supabase.co/functions/v1/whatsapp-webhook`;

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
 * 2. Fail closed when TARGET_ENV is missing, production, or any non-staging value.
 * 3. Fail closed when the Supabase hostname is not the exact staging project.
 */
export function isWhatsAppStagingAllowed(env?: WhatsAppRouteGuardEnv): boolean {
  const rawTarget = env && env.targetEnv !== undefined ? env.targetEnv : process.env.TARGET_ENV;
  const targetEnv = (rawTarget || "").toLowerCase().trim();

  // Fail closed when TARGET_ENV is missing, production, or anything other than staging
  if (!targetEnv || targetEnv !== "staging") {
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

  const isStagingProject = parsedHostname === `${STAGING_PROJECT_REF}.supabase.co`;
  if (!isStagingProject) {
    return false;
  }

  return true;
}
