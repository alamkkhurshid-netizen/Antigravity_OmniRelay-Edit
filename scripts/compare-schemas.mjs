import pg from "pg";
import { writeFileSync } from "fs";

async function dumpSchemaMetadata(connectionString, label) {
  const client = new pg.Client(connectionString);
  await client.connect();

  console.log(`[Schema Dump] Dumping metadata for ${label}...`);

  // 1. Tables and Columns
  const { rows: columns } = await client.query(`
    SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'billing', 'private', 'supabase_migrations')
    ORDER BY table_schema, table_name, column_name;
  `);

  // 2. Constraints (Normalized via pg_constraint, avoiding ephemeral PostgreSQL OID names for system not-nulls)
  const { rows: constraints } = await client.query(`
    SELECT n.nspname as table_schema,
           t.relname as table_name,
           c.conname as constraint_name,
           c.contype as constraint_type,
           pg_get_constraintdef(c.oid) as definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname IN ('public', 'billing', 'private', 'supabase_migrations')
    ORDER BY n.nspname, t.relname, c.contype, definition;
  `);

  // 3. Indexes
  const { rows: indexes } = await client.query(`
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname IN ('public', 'billing', 'private', 'supabase_migrations')
    ORDER BY schemaname, tablename, indexname;
  `);

  // 4. Functions
  const { rows: functions } = await client.query(`
    SELECT n.nspname as schema, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'billing', 'private')
    ORDER BY n.nspname, p.proname, args;
  `);

  // 5. Triggers
  const { rows: triggers } = await client.query(`
    SELECT trigger_schema, event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema IN ('public', 'billing', 'private')
    ORDER BY trigger_schema, event_object_table, trigger_name;
  `);

  // 6. RLS Policies
  const { rows: policies } = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd
    FROM pg_policies
    WHERE schemaname IN ('public', 'billing', 'private')
    ORDER BY schemaname, tablename, policyname;
  `);

  // 7. Extensions
  const { rows: extensions } = await client.query(`
    SELECT extname, extversion
    FROM pg_extension
    ORDER BY extname;
  `);

  // 8. Grants / Table Permissions
  const { rows: grants } = await client.query(`
    SELECT table_schema, table_name, grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema IN ('public', 'billing', 'private')
      AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres')
    ORDER BY table_schema, table_name, grantee, privilege_type;
  `);

  await client.end();

  return {
    columns,
    constraints,
    indexes,
    functions,
    triggers,
    policies,
    extensions,
    grants
  };
}

function compareObjects(freshArr, upgradedArr, keyFn, category) {
  const freshMap = new Map(freshArr.map((item) => [keyFn(item), item]));
  const upgradedMap = new Map(upgradedArr.map((item) => [keyFn(item), item]));

  const missingInUpgraded = [];
  const missingInFresh = [];
  const differences = [];

  for (const [key, freshItem] of freshMap) {
    if (!upgradedMap.has(key)) {
      missingInUpgraded.push(key);
    } else {
      const upItem = upgradedMap.get(key);
      const strFresh = JSON.stringify(freshItem);
      const strUp = JSON.stringify(upItem);
      if (strFresh !== strUp) {
        differences.push({ key, fresh: freshItem, upgraded: upItem });
      }
    }
  }

  for (const [key] of upgradedMap) {
    if (!freshMap.has(key)) {
      missingInFresh.push(key);
    }
  }

  return {
    category,
    freshCount: freshArr.length,
    upgradedCount: upgradedArr.length,
    missingInUpgraded,
    missingInFresh,
    differences,
    isEqual: missingInUpgraded.length === 0 && missingInFresh.length === 0 && differences.length === 0
  };
}

async function main() {
  const freshUrl = process.env.FRESH_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54323/postgres";
  const upgradedUrl = process.env.UPGRADED_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54324/postgres";

  const fresh = await dumpSchemaMetadata(freshUrl, "FRESH (disposable 54323)");
  const upgraded = await dumpSchemaMetadata(upgradedUrl, "UPGRADED (staging 54324)");

  const comparisons = [
    compareObjects(fresh.columns, upgraded.columns, (c) => `${c.table_schema}.${c.table_name}.${c.column_name}`, "Columns"),
    compareObjects(fresh.constraints, upgraded.constraints, (c) => `${c.table_schema}.${c.table_name}.${c.constraint_type}:${c.definition}`, "Constraints"),
    compareObjects(fresh.indexes, upgraded.indexes, (i) => `${i.schemaname}.${i.tablename}.${i.indexname}`, "Indexes"),
    compareObjects(fresh.functions, upgraded.functions, (f) => `${f.schema}.${f.function_name}(${f.args})`, "Functions"),
    compareObjects(fresh.triggers, upgraded.triggers, (t) => `${t.trigger_schema}.${t.event_object_table}.${t.trigger_name}`, "Triggers"),
    compareObjects(fresh.policies, upgraded.policies, (p) => `${p.schemaname}.${p.tablename}.${p.policyname}`, "RLS Policies"),
    compareObjects(fresh.extensions, upgraded.extensions, (e) => e.extname, "Extensions"),
    compareObjects(fresh.grants, upgraded.grants, (g) => `${g.table_schema}.${g.table_name}.${g.grantee}.${g.privilege_type}`, "Grants")
  ];

  console.log("\n================ SCHEMA COMPARISON SUMMARY ================");
  let allEqual = true;
  for (const res of comparisons) {
    const status = res.isEqual ? "MATCH (100% PARITY)" : "DIFFERENCES DETECTED";
    console.log(`- ${res.category.padEnd(14)}: ${status} [Fresh: ${res.freshCount}, Upgraded: ${res.upgradedCount}]`);
    if (!res.isEqual) {
      allEqual = false;
      if (res.missingInUpgraded.length > 0) console.log(`    Missing in Upgraded: ${res.missingInUpgraded.join(", ")}`);
      if (res.missingInFresh.length > 0) console.log(`    Missing in Fresh: ${res.missingInFresh.join(", ")}`);
      if (res.differences.length > 0) console.log(`    Value differences: ${res.differences.length} items`);
    }
  }
  console.log("===========================================================\n");

  const report = {
    timestamp: new Date().toISOString(),
    freshUrl,
    upgradedUrl,
    allEqual,
    results: comparisons
  };

  writeFileSync("scratch/schema-comparison-report.json", JSON.stringify(report, null, 2));
  console.log("Wrote scratch/schema-comparison-report.json");

  if (!allEqual) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Comparison error:", err);
  process.exit(1);
});
