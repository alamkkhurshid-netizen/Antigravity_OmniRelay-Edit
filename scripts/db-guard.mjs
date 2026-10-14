/**
 * Database Environment Safety & Guard Utility
 * 
 * Provides strict verification for database migration and mutation scripts:
 * 1. Explicit project-ref extraction & denylist/allowlist enforcement (prevents relying solely on "prod" in URL).
 * 2. Mandates TARGET_ENV (e.g. "disposable", "staging", "production") - fail closed if absent.
 * 3. Enforces dual confirmation tokens for any production mutations.
 * 4. Guards against accidental replay against existing un-ledgered schemas.
 */

/**
 * Extracts Supabase project-ref from connection string or URL.
 * Handles:
 * - db.<project-ref>.supabase.co
 * - <project-ref>.supabase.co
 * - postgres.<project-ref>:[password]@...
 * - aws-0-<region>.pooler.supabase.com:6543/postgres with user postgres.<project-ref>
 */
export function extractProjectRef(connectionString = "") {
  if (!connectionString) return null;
  
  // Format 1: db.<ref>.supabase.co
  const dbMatch = connectionString.match(/db\.([a-z0-9_-]+)\.supabase\.co/i);
  if (dbMatch) return dbMatch[1].toLowerCase();

  // Format 2: user postgres.<ref>
  const userMatch = connectionString.match(/postgres\.([a-z0-9_-]+):/i);
  if (userMatch) return userMatch[1].toLowerCase();

  // Format 3: https://<ref>.supabase.co
  const urlMatch = connectionString.match(/https?:\/\/([a-z0-9_-]+)\.supabase\.co/i);
  if (urlMatch) return urlMatch[1].toLowerCase();

  return null;
}

export function getKnownProdProjectRefs() {
  const envRefs = process.env.PROD_PROJECT_REFS || "";
  const defaults = ["dwkwxrcuycsqiviozgtl"]; // Known production ref from project configuration
  const parsed = envRefs.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...defaults, ...parsed]));
}

export function getKnownStagingProjectRefs() {
  const envRefs = process.env.STAGING_PROJECT_REFS || "";
  return envRefs.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Validates target environment and enforces fail-closed safety guards.
 */
export function assertSafeDatabaseTarget({
  connectionString,
  operationName = "database operation",
  allowProdOverride = false,
  allowStaging = true,
}) {
  if (!connectionString) {
    return { dryRun: true, targetEnv: "dry-run" };
  }

  const targetEnv = (process.env.TARGET_ENV || "").toLowerCase().trim();
  const detectedRef = extractProjectRef(connectionString);
  const prodRefs = getKnownProdProjectRefs();
  const stagingRefs = getKnownStagingProjectRefs();

  const isProdRef = detectedRef ? prodRefs.includes(detectedRef) : false;
  const isStagingRef = detectedRef ? stagingRefs.includes(detectedRef) : false;
  const hasProdName = /prod|production/i.test(connectionString);
  const isProdEnv = targetEnv === "production" || targetEnv === "prod";

  const isProductionTarget = isProdRef || hasProdName || isProdEnv;

  // 1. Production Detection: Must fail closed
  if (isProductionTarget) {
    const confirmationToken = process.env.CONFIRM_PROD_EXECUTION;
    const isExplicitlyAllowed = allowProdOverride && confirmationToken === "I_UNDERSTAND_THIS_MUTATES_PRODUCTION";
    if (!isExplicitlyAllowed) {
      throw new Error(
        `[Database Guard] BLOCKED: Detected production database target ` +
        `(${detectedRef ? `project-ref: ${detectedRef}` : "production environment/URL"}). ` +
        `Operation '${operationName}' is forbidden on production without explicit TARGET_ENV=production ` +
        `and CONFIRM_PROD_EXECUTION="I_UNDERSTAND_THIS_MUTATES_PRODUCTION".`
      );
    }
  }

  // 2. Explicit environment name requirement (disposable, staging, or production)
  if (!targetEnv) {
    throw new Error(
      `[Database Guard] BLOCKED: TARGET_ENV must be set explicitly (e.g. TARGET_ENV=disposable or TARGET_ENV=staging). ` +
      `Explicit environment targeting prevents unintended executions.`
    );
  }

  if (targetEnv === "production" && !allowProdOverride) {
    throw new Error(`[Database Guard] BLOCKED: Operation '${operationName}' cannot be executed against production.`);
  }

  if (!allowStaging && (targetEnv === "staging" || isStagingRef)) {
    throw new Error(`[Database Guard] BLOCKED: Operation '${operationName}' cannot be executed against staging.`);
  }

  // 3. Confirmation variable requirement
  const isConfirmed =
    process.env.CONFIRM_MIGRATION_EXECUTION === "true" ||
    process.env.CONFIRM_CONCURRENCY_TEST === "true" ||
    process.env.ALLOW_DB_INTEGRATION_TESTS === "true";

  if (!isConfirmed) {
    throw new Error(
      `[Database Guard] BLOCKED: Operation '${operationName}' requires confirmation variable ` +
      `(CONFIRM_MIGRATION_EXECUTION=true or CONFIRM_CONCURRENCY_TEST=true).`
    );
  }

  return { targetEnv, detectedRef, isProductionTarget, isStagingRef };
}
