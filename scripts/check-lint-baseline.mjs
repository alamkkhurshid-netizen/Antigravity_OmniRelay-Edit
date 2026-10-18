/**
 * ESLint Warning Ratchet & Baseline Enforcement Script
 * 
 * Enforces:
 * 1. ZERO lint errors allowed on remediation/cto-pilot-readiness.
 * 2. Warning count must not exceed the recorded baseline.
 * 3. Any increase in warnings fails CI immediately.
 * 4. Ratchet enforces monotonic improvement as warnings are resolved.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Recorded baseline for warnings on remediation/cto-pilot-readiness branch
const MAX_ALLOWED_WARNINGS = 193;

console.log(`[Lint Ratchet] Verifying code quality against baseline (max warnings: ${MAX_ALLOWED_WARNINGS})...`);

const eslintCli = path.resolve(projectRoot, "node_modules/eslint/bin/eslint.js");
const child = spawn(
  process.execPath,
  [
    eslintCli,
    ".",
    "--format",
    "json",
    "--ignore-pattern",
    "dist",
    "--ignore-pattern",
    ".next",
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
  }
);

let stdoutData = "";
let stderrData = "";

child.stdout.on("data", (chunk) => {
  stdoutData += chunk;
});

child.stderr.on("data", (chunk) => {
  stderrData += chunk;
});

child.on("close", (_code) => {
  if (stderrData.trim()) {
    console.warn(`[Lint Ratchet] ESLint stderr:\n${stderrData}`);
  }

  let results = [];
  try {
    results = JSON.parse(stdoutData);
  } catch (parseErr) {
    console.error(`[Lint Ratchet] FAILED: Could not parse ESLint JSON output:`, parseErr.message);
    if (stdoutData) console.error(stdoutData.slice(0, 500));
    process.exit(1);
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  const warningsByRule = {};

  for (const file of results) {
    totalErrors += file.errorCount || 0;
    totalWarnings += file.warningCount || 0;

    if (file.messages && file.messages.length > 0) {
      for (const msg of file.messages) {
        if (msg.severity === 1) {
          warningsByRule[msg.ruleId] = (warningsByRule[msg.ruleId] || 0) + 1;
        }
      }
    }
  }

  console.log(`\n================ LINT QUALITY REPORT ================`);
  console.log(`Files Analyzed : ${results.length}`);
  console.log(`Total Errors   : ${totalErrors} (Target: 0)`);
  console.log(`Total Warnings : ${totalWarnings} (Baseline Ceiling: ${MAX_ALLOWED_WARNINGS})`);
  console.log(`Rules Breakdown:`, warningsByRule);
  console.log(`=====================================================\n`);

  if (totalErrors > 0) {
    console.error(`❌ [Lint Ratchet] BLOCKED: Found ${totalErrors} lint error(s). 0 errors required.`);
    for (const file of results) {
      if (file.errorCount > 0) {
        console.error(`File: ${file.filePath}`);
        for (const msg of file.messages) {
          if (msg.severity === 2) {
            console.error(`  Line ${msg.line}:${msg.column} [${msg.ruleId}] ${msg.message}`);
          }
        }
      }
    }
    process.exit(1);
  }

  if (totalWarnings > MAX_ALLOWED_WARNINGS) {
    console.error(
      `❌ [Lint Ratchet] BLOCKED: Warning count (${totalWarnings}) exceeds recorded baseline (${MAX_ALLOWED_WARNINGS})!\n` +
      `New warnings are prohibited. Fix or revert warning additions before merging.`
    );
    process.exit(1);
  }

  if (totalWarnings < MAX_ALLOWED_WARNINGS) {
    console.log(
      `✅ [Lint Ratchet] PROGRESS: Warning count decreased from ${MAX_ALLOWED_WARNINGS} to ${totalWarnings}! ` +
      `You may lower MAX_ALLOWED_WARNINGS in scripts/check-lint-baseline.mjs to ${totalWarnings}.`
    );
  } else {
    console.log(`✅ [Lint Ratchet] PASSED: 0 errors and warning count is within baseline ceiling (${totalWarnings}/${MAX_ALLOWED_WARNINGS}).`);
  }

  process.exit(0);
});
