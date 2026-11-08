/**
 * OmniRelay Database Migration CI Validation Gate
 * S9-09: Validates SQL migrations before PR merge to prevent broken schema states.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, "../supabase/migrations");

console.log("[Migration CI] Validating database migrations in:", MIGRATIONS_DIR);

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error("❌ Migrations directory does not exist:", MIGRATIONS_DIR);
  process.exit(1);
}

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
console.log(`[Migration CI] Found ${files.length} SQL migration files.`);

if (files.length === 0) {
  console.error("❌ No migration files found.");
  process.exit(1);
}

let errorCount = 0;
const timestampSet = new Set();
const migrationPattern = /^(\d{14})_([a-z0-9_]+)\.sql$/;

for (const file of files) {
  const match = file.match(migrationPattern);
  if (!match) {
    console.error(`❌ Invalid migration filename format: ${file} (expected YYYYMMDDHHMMSS_name.sql)`);
    errorCount++;
    continue;
  }

  const timestamp = match[1];
  if (timestampSet.has(timestamp)) {
    console.error(`❌ Duplicate migration timestamp prefix: ${timestamp} in file ${file}`);
    errorCount++;
  }
  timestampSet.add(timestamp);

  const fullPath = path.join(MIGRATIONS_DIR, file);
  const content = fs.readFileSync(fullPath, "utf-8");

  if (content.trim().length === 0) {
    console.error(`❌ Empty migration file: ${file}`);
    errorCount++;
  }

  // Safety checks
  const lower = content.toLowerCase();
  if (lower.includes("drop database") || lower.includes("drop schema public")) {
    console.error(`❌ Prohibited destructive command in migration: ${file}`);
    errorCount++;
  }

  // Check for bare DROP TABLE without IF EXISTS (allow DROP TABLE IF EXISTS)
  const bareDropRegex = /drop\s+table\s+(?!if\s+exists)[a-z0-9_.]+/i;
  if (bareDropRegex.test(content) && !file.includes("initial_schema")) {
    console.warn(`⚠️ Warning: Bare 'DROP TABLE' detected without 'IF EXISTS' in ${file}. Ensure idempotency.`);
  }
}

if (errorCount > 0) {
  console.error(`\n❌ [Migration CI] Validation failed with ${errorCount} errors.`);
  process.exit(1);
}

console.log(`\n✅ [Migration CI] All ${files.length} migrations passed format, timestamp, and safety checks.`);
process.exit(0);
