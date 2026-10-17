/**
 * Database Environment Safety & Guard Utility
 * 
 * Provides strict, isolated verification for database migration and mutation scripts:
 * 1. Explicit project-ref extraction & denylist/allowlist enforcement (prevents relying solely on "prod" in URL).
 * 2. Mandates TARGET_ENV (e.g. "disposable", "staging", "production") - fail closed if absent.
 * 3. Operation-specific confirmation enforcement:
 *    - Migrations: require TARGET_ENV=disposable|staging and CONFIRM_MIGRATION_EXECUTION=true.
 *      Production migrations require TARGET_ENV=production, ALLOW_PROD_MIGRATIONS=true, and CONFIRM_PROD_EXECUTION="I_UNDERSTAND_THIS_MUTATES_PRODUCTION".
 *    - Concurrency testing: requires TARGET_ENV=disposable, ALLOW_DB_INTEGRATION_TESTS=true, and CONFIRM_CONCURRENCY_TEST=true.
 *      Concurrency flags never authorize migrations.
 *      Production concurrency testing is strictly prohibited.
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
 * Validates target environment and enforces fail-closed, operation-specific safety guards.
 *
 * @param {Object} options
 * @param {string} options.connectionString - Target PostgreSQL connection string
 * @param {"migration" | "concurrency-test"} [options.operationType] - Type of operation being authorized
 * @param {string} [options.operationName] - Human-readable operation name for logging
 * @param {boolean} [options.allowProdOverride=false] - Whether production execution can be authorized
 * @param {boolean} [options.allowStaging=true] - Whether staging execution is permitted
 */
export function assertSafeDatabaseTarget({
  connectionString,
  operationType,
  operationName = "database operation",
  allowProdOverride = false,
  allowStaging = true,
}) {
  if (!connectionString) {
    return { dryRun: true, targetEnv: "dry-run" };
  }

  // Derive operationType if not explicitly passed
  let resolvedType = operationType;
  if (!resolvedType) {
    if (operationName.includes("migration") || operationName.includes("db-migration")) {
      resolvedType = "migration";
    } else if (operationName.includes("concurrency")) {
      resolvedType = "concurrency-test";
    } else {
      throw new Error(`[Database Guard] BLOCKED: operationType ('migration' | 'concurrency-test') is required.`);
    }
  }

  const targetEnv = (process.env.TARGET_ENV || "").toLowerCase().trim();
  if (!targetEnv) {
    throw new Error(
      `[Database Guard] BLOCKED: TARGET_ENV must be set explicitly (e.g. TARGET_ENV=disposable or TARGET_ENV=staging). ` +
      `Explicit environment targeting prevents unintended executions.`
    );
  }

  const detectedRef = extractProjectRef(connectionString);
  const prodRefs = getKnownProdProjectRefs();
  const stagingRefs = getKnownStagingProjectRefs();

  const isProdRef = detectedRef ? prodRefs.includes(detectedRef) : false;
  const isStagingRef = detectedRef ? stagingRefs.includes(detectedRef) : false;
  const hasProdName = /prod|production/i.test(connectionString);
  const isProdEnv = targetEnv === "production" || targetEnv === "prod";

  const isProductionTarget = isProdRef || hasProdName || isProdEnv;

  // ==========================================
  // OPERATION 1: CONCURRENCY TESTING
  // ==========================================
  if (resolvedType === "concurrency-test") {
    // 1. Production is strictly prohibited under all circumstances
    if (isProductionTarget) {
      throw new Error(
        `[Database Guard] BLOCKED: Concurrency mutation testing is strictly prohibited on production databases ` +
        `(${detectedRef ? `project-ref: ${detectedRef}` : "production environment/URL"}).`
      );
    }

    // 2. Concurrency testing is only permitted against disposable databases
    if (targetEnv !== "disposable" || isStagingRef || !allowStaging) {
      throw new Error(
        `[Database Guard] BLOCKED: Concurrency testing requires TARGET_ENV=disposable. ` +
        `Running concurrency tests on staging or production is strictly prohibited.`
      );
    }

    // 3. Isolated confirmation requirements: both ALLOW_DB_INTEGRATION_TESTS and CONFIRM_CONCURRENCY_TEST
    const hasOptIn = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
    const hasConcurrencyConfirm = process.env.CONFIRM_CONCURRENCY_TEST === "true";

    if (!hasOptIn || !hasConcurrencyConfirm) {
      throw new Error(
        `[Database Guard] BLOCKED: Concurrency testing requires BOTH ALLOW_DB_INTEGRATION_TESTS=true ` +
        `and CONFIRM_CONCURRENCY_TEST=true.`
      );
    }

    return { targetEnv, detectedRef, isProductionTarget: false, isStagingRef: false, operationType: resolvedType };
  }

  // ==========================================
  // OPERATION 2: DATABASE MIGRATIONS
  // ==========================================
  if (resolvedType === "migration") {
    if (!["disposable", "staging", "production"].includes(targetEnv)) {
      throw new Error(
        `[Database Guard] BLOCKED: Migrations require TARGET_ENV to be 'disposable', 'staging', or 'production'.`
      );
    }

    // Production Migrations Guard
    if (isProductionTarget || targetEnv === "production") {
      const hasProdEnv = targetEnv === "production";
      const hasAllowProdMigrations = process.env.ALLOW_PROD_MIGRATIONS === "true";
      const confirmationToken = process.env.CONFIRM_PROD_EXECUTION;
      const isConfirmed = confirmationToken === "I_UNDERSTAND_THIS_MUTATES_PRODUCTION";

      if (!allowProdOverride || !hasProdEnv || !hasAllowProdMigrations || !isConfirmed) {
        throw new Error(
          `[Database Guard] BLOCKED: Production migrations require ALL of: ` +
          `TARGET_ENV=production, ALLOW_PROD_MIGRATIONS=true, and CONFIRM_PROD_EXECUTION="I_UNDERSTAND_THIS_MUTATES_PRODUCTION".`
        );
      }

      return { targetEnv: "production", detectedRef, isProductionTarget: true, isStagingRef: false, operationType: resolvedType };
    }

    // Disposable or Staging Migrations
    if (isProdRef || hasProdName) {
      throw new Error(
        `[Database Guard] BLOCKED: Connection URL matches production target (${detectedRef || connectionString}), ` +
        `but TARGET_ENV is set to '${targetEnv}'. Production targets cannot be used with non-production TARGET_ENV.`
      );
    }

    // Require CONFIRM_MIGRATION_EXECUTION=true.
    // Concurrency flags (ALLOW_DB_INTEGRATION_TESTS, CONFIRM_CONCURRENCY_TEST) MUST NEVER authorize migrations.
    const hasMigrationConfirm = process.env.CONFIRM_MIGRATION_EXECUTION === "true";
    if (!hasMigrationConfirm) {
      throw new Error(
        `[Database Guard] BLOCKED: Migrations on ${targetEnv} require CONFIRM_MIGRATION_EXECUTION=true. ` +
        `Concurrency flags do not authorize migration execution.`
      );
    }

    return { targetEnv, detectedRef, isProductionTarget: false, isStagingRef, operationType: resolvedType };
  }

  throw new Error(`[Database Guard] BLOCKED: Unknown operationType '${resolvedType}'.`);
}
