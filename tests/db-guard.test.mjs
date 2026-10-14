import test from "node:test";
import assert from "node:assert/strict";
import { extractProjectRef, assertSafeDatabaseTarget } from "../scripts/db-guard.mjs";

test("extractProjectRef correctly extracts Supabase project refs from various URL formats", () => {
  // Direct db hostname
  assert.equal(
    extractProjectRef("postgresql://postgres:pass@db.dwkwxrcuycsqiviozgtl.supabase.co:5432/postgres"),
    "dwkwxrcuycsqiviozgtl"
  );

  // Pooler format with user postgres.<ref>
  assert.equal(
    extractProjectRef("postgresql://postgres.dwkwxrcuycsqiviozgtl:pass@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"),
    "dwkwxrcuycsqiviozgtl"
  );

  // HTTPS Supabase URL
  assert.equal(
    extractProjectRef("https://dwkwxrcuycsqiviozgtl.supabase.co"),
    "dwkwxrcuycsqiviozgtl"
  );

  // Localhost returns null
  assert.equal(
    extractProjectRef("postgresql://postgres:pass@127.0.0.1:54322/postgres"),
    null
  );
});

test("assertSafeDatabaseTarget blocks production target without explicit token", () => {
  const prodUrl = "postgresql://postgres:pass@db.dwkwxrcuycsqiviozgtl.supabase.co:5432/postgres";

  // Production detected by ref even if URL has no 'prod' string
  assert.throws(
    () => {
      assertSafeDatabaseTarget({
        connectionString: prodUrl,
        operationName: "test-op"
      });
    },
    /BLOCKED: Detected production database target/
  );
});

test("assertSafeDatabaseTarget requires TARGET_ENV and confirmation token for non-production", () => {
  const stagingUrl = "postgresql://postgres:pass@db.stagingref123.supabase.co:5432/postgres";

  // Missing TARGET_ENV
  const origEnv = process.env.TARGET_ENV;
  const origConfirm = process.env.CONFIRM_MIGRATION_EXECUTION;
  try {
    delete process.env.TARGET_ENV;
    delete process.env.CONFIRM_MIGRATION_EXECUTION;

    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: stagingUrl,
          operationName: "staging-migration"
        });
      },
      /TARGET_ENV must be set explicitly/
    );

    // With TARGET_ENV but missing confirmation token
    process.env.TARGET_ENV = "staging";
    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: stagingUrl,
          operationName: "staging-migration"
        });
      },
      /requires confirmation variable/
    );

    // With both TARGET_ENV and CONFIRM_MIGRATION_EXECUTION
    process.env.CONFIRM_MIGRATION_EXECUTION = "true";
    const res = assertSafeDatabaseTarget({
      connectionString: stagingUrl,
      operationName: "staging-migration"
    });
    assert.equal(res.targetEnv, "staging");
    assert.equal(res.detectedRef, "stagingref123");
  } finally {
    if (origEnv !== undefined) process.env.TARGET_ENV = origEnv;
    else delete process.env.TARGET_ENV;
    if (origConfirm !== undefined) process.env.CONFIRM_MIGRATION_EXECUTION = origConfirm;
    else delete process.env.CONFIRM_MIGRATION_EXECUTION;
  }
});
