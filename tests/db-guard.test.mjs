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

test("assertSafeDatabaseTarget: Migrations require explicit CONFIRM_MIGRATION_EXECUTION (concurrency flags never authorize migrations)", () => {
  const stagingUrl = "postgresql://postgres:pass@db.stagingref123.supabase.co:5432/postgres";
  const savedEnv = { ...process.env };

  try {
    process.env.TARGET_ENV = "staging";
    delete process.env.CONFIRM_MIGRATION_EXECUTION;
    
    // Set concurrency flags only
    process.env.ALLOW_DB_INTEGRATION_TESTS = "true";
    process.env.CONFIRM_CONCURRENCY_TEST = "true";

    // Concurrency flags must NOT authorize migration
    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: stagingUrl,
          operationType: "migration",
          operationName: "db-migration:upgrade"
        });
      },
      /Concurrency flags do not authorize migration execution/
    );

    // With explicit CONFIRM_MIGRATION_EXECUTION=true
    process.env.CONFIRM_MIGRATION_EXECUTION = "true";
    const res = assertSafeDatabaseTarget({
      connectionString: stagingUrl,
      operationType: "migration",
      operationName: "db-migration:upgrade"
    });
    assert.equal(res.targetEnv, "staging");
    assert.equal(res.operationType, "migration");
  } finally {
    process.env = savedEnv;
  }
});

test("assertSafeDatabaseTarget: Production migrations require ALL three production safeguards", () => {
  const prodUrl = "postgresql://postgres:pass@db.dwkwxrcuycsqiviozgtl.supabase.co:5432/postgres";
  const savedEnv = { ...process.env };

  try {
    process.env.TARGET_ENV = "production";
    delete process.env.ALLOW_PROD_MIGRATIONS;
    delete process.env.CONFIRM_PROD_EXECUTION;

    // 1. Missing allowProdOverride
    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: prodUrl,
          operationType: "migration",
          operationName: "db-migration:upgrade",
          allowProdOverride: false
        });
      },
      /Production migrations require ALL of/
    );

    // 2. Missing ALLOW_PROD_MIGRATIONS
    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: prodUrl,
          operationType: "migration",
          operationName: "db-migration:upgrade",
          allowProdOverride: true
        });
      },
      /Production migrations require ALL of/
    );

    // 3. With ALLOW_PROD_MIGRATIONS but missing confirmation token
    process.env.ALLOW_PROD_MIGRATIONS = "true";
    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: prodUrl,
          operationType: "migration",
          operationName: "db-migration:upgrade",
          allowProdOverride: true
        });
      },
      /Production migrations require ALL of/
    );

    // 4. With all 3: TARGET_ENV=production, ALLOW_PROD_MIGRATIONS=true, and token
    process.env.CONFIRM_PROD_EXECUTION = "I_UNDERSTAND_THIS_MUTATES_PRODUCTION";
    const res = assertSafeDatabaseTarget({
      connectionString: prodUrl,
      operationType: "migration",
      operationName: "db-migration:upgrade",
      allowProdOverride: true
    });
    assert.equal(res.targetEnv, "production");
    assert.equal(res.isProductionTarget, true);
  } finally {
    process.env = savedEnv;
  }
});

test("assertSafeDatabaseTarget: Concurrency testing prohibits production and staging, requires isolated concurrency tokens", () => {
  const prodUrl = "postgresql://postgres:pass@db.dwkwxrcuycsqiviozgtl.supabase.co:5432/postgres";
  const stagingUrl = "postgresql://postgres:pass@db.stagingref123.supabase.co:5432/postgres";
  const disposableUrl = "postgresql://postgres:pass@db.disposableref123.supabase.co:5432/postgres";
  const savedEnv = { ...process.env };

  try {
    // 1. Concurrency testing on production is strictly prohibited even with tokens
    process.env.TARGET_ENV = "production";
    process.env.ALLOW_DB_INTEGRATION_TESTS = "true";
    process.env.CONFIRM_CONCURRENCY_TEST = "true";
    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: prodUrl,
          operationType: "concurrency-test",
          operationName: "billing-concurrency-test"
        });
      },
      /Concurrency mutation testing is strictly prohibited on production databases/
    );

    // 2. Concurrency testing on staging is prohibited
    process.env.TARGET_ENV = "staging";
    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: stagingUrl,
          operationType: "concurrency-test",
          operationName: "billing-concurrency-test"
        });
      },
      /Concurrency testing requires TARGET_ENV=disposable/
    );

    // 3. Concurrency testing on disposable requires BOTH ALLOW_DB_INTEGRATION_TESTS and CONFIRM_CONCURRENCY_TEST
    process.env.TARGET_ENV = "disposable";
    delete process.env.ALLOW_DB_INTEGRATION_TESTS;
    delete process.env.CONFIRM_CONCURRENCY_TEST;
    process.env.CONFIRM_MIGRATION_EXECUTION = "true"; // Migration token must NOT satisfy concurrency test

    assert.throws(
      () => {
        assertSafeDatabaseTarget({
          connectionString: disposableUrl,
          operationType: "concurrency-test",
          operationName: "billing-concurrency-test"
        });
      },
      /requires BOTH ALLOW_DB_INTEGRATION_TESTS=true and CONFIRM_CONCURRENCY_TEST=true/
    );

    // 4. Concurrency testing succeeds with both tokens on disposable
    process.env.ALLOW_DB_INTEGRATION_TESTS = "true";
    process.env.CONFIRM_CONCURRENCY_TEST = "true";
    const res = assertSafeDatabaseTarget({
      connectionString: disposableUrl,
      operationType: "concurrency-test",
      operationName: "billing-concurrency-test"
    });
    assert.equal(res.targetEnv, "disposable");
    assert.equal(res.operationType, "concurrency-test");
  } finally {
    process.env = savedEnv;
  }
});
