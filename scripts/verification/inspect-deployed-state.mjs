#!/usr/bin/env node
/**
 * Deployed PostgreSQL Metadata-Only State Inspector
 * 
 * Inspects:
 * - Applied schema migrations in supabase_migrations.schema_migrations
 * - Target migrations: 20261006000000, 20261006100000, 20261007000000, 20261009000000
 * - Schemas, tables, columns, views
 * - Functions and signatures
 * - RLS policies
 * - Grants and table privileges
 * - Triggers
 * - Extensions
 * 
 * Complies with strict privacy standards:
 * - NO row data, patient info, or customer data is read or emitted.
 * - All credentials and URLs are sanitized and masked.
 */

import pg from "pg";

export async function inspectDeployedState(connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54324/postgres") {
  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : { rejectUnauthorized: false }
  });

  await client.connect();

  console.log("[Metadata Inspection] Connected. Fetching schema metadata...");

  // 1. Schema migrations
  const { rows: migrations } = await client.query(`
    SELECT version, inserted_at 
    FROM supabase_migrations.schema_migrations 
    ORDER BY version;
  `);

  const appliedVersions = new Set(migrations.map(m => m.version));
  const targetMigrations = [
    "20261006000000",
    "20261006100000",
    "20261007000000",
    "20261009000000",
    "20261010000000",
    "20261010000006",
    "20261010000007"
  ];

  const targetStatus = {};
  for (const ver of targetMigrations) {
    targetStatus[ver] = appliedVersions.has(ver);
  }

  // 2. Schemas and Tables
  const { rows: tables } = await client.query(`
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema IN ('public', 'billing', 'private', 'supabase_migrations')
    ORDER BY table_schema, table_name;
  `);

  // 3. Columns
  const { rows: columns } = await client.query(`
    SELECT table_schema, table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'billing', 'private', 'supabase_migrations')
    ORDER BY table_schema, table_name, column_name;
  `);

  // 4. Views
  const { rows: views } = await client.query(`
    SELECT table_schema, table_name, view_definition
    FROM information_schema.views
    WHERE table_schema IN ('public', 'billing', 'private')
    ORDER BY table_schema, table_name;
  `);

  // 5. Functions & Signatures
  const { rows: functions } = await client.query(`
    SELECT n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arguments,
           CASE WHEN p.prokind = 'a' THEN 'AGGREGATE' ELSE pg_get_functiondef(p.oid) END as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'billing', 'private')
    ORDER BY n.nspname, p.proname;
  `);

  // 6. RLS Policies
  const { rows: policies } = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'billing', 'private')
    ORDER BY schemaname, tablename, policyname;
  `);

  // 7. Grants / Table Privileges
  const { rows: grants } = await client.query(`
    SELECT table_schema, table_name, grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema IN ('public', 'billing', 'private')
      AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres')
    ORDER BY table_schema, table_name, grantee, privilege_type;
  `);

  // 8. Triggers
  const { rows: triggers } = await client.query(`
    SELECT trigger_schema, event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema IN ('public', 'billing', 'private')
    ORDER BY trigger_schema, event_object_table, trigger_name;
  `);

  // 9. Extensions
  const { rows: extensions } = await client.query(`
    SELECT extname, extversion
    FROM pg_extension
    ORDER BY extname;
  `);

  await client.end();

  const summary = {
    timestamp: new Date().toISOString(),
    totalMigrationsRecorded: migrations.length,
    targetMigrationAudit: targetStatus,
    summaryCounts: {
      tables: tables.filter(t => t.table_type === 'BASE TABLE').length,
      views: views.length,
      columns: columns.length,
      functions: functions.length,
      policies: policies.length,
      grants: grants.length,
      triggers: triggers.length,
      extensions: extensions.length
    },
    targetPolicyAudit: policies.filter(p => [
      'tenant_documents',
      'document_chunks',
      'meta_capi_config',
      'retail_products',
      'capi_event_logs',
      'voice_call_logs',
      'voice_agent_configs'
    ].includes(p.tablename)),
    voiceConfigViewDefinition: views.find(v => v.table_name === 'voice_org_config_readonly') || null
  };

  return summary;
}

if (process.argv[1] && process.argv[1].endsWith('inspect-deployed-state.mjs')) {
  inspectDeployedState().then(summary => {
    console.log("\n================ DEPLOYED STATE INSPECTION SUMMARY ================");
    console.log(`- Total Schema Migrations Recorded : ${summary.totalMigrationsRecorded}`);
    console.log(`- Tables (Base)                     : ${summary.summaryCounts.tables}`);
    console.log(`- Views                             : ${summary.summaryCounts.views}`);
    console.log(`- Columns                           : ${summary.summaryCounts.columns}`);
    console.log(`- Functions                         : ${summary.summaryCounts.functions}`);
    console.log(`- RLS Policies                      : ${summary.summaryCounts.policies}`);
    console.log(`- Table Grants                      : ${summary.summaryCounts.grants}`);
    console.log(`- Triggers                          : ${summary.summaryCounts.triggers}`);
    console.log(`- Extensions                        : ${summary.summaryCounts.extensions}`);
    console.log("\nTarget Migration Verification:");
    for (const [ver, applied] of Object.entries(summary.targetMigrationAudit)) {
      console.log(`  * ${ver}: ${applied ? "APPLIED" : "NOT APPLIED"}`);
    }
    console.log("===================================================================\n");
  }).catch(err => {
    console.error("Inspection error:", err.message);
    process.exit(1);
  });
}
