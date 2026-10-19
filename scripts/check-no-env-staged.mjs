#!/usr/bin/env node
/**
 * check-no-env-staged.mjs
 * Fails CI / pre-commit if any .env file is staged or tracked.
 * Run: node scripts/check-no-env-staged.mjs
 */

import { execSync } from "node:child_process";

const FORBIDDEN_PATTERNS = [".env", ".env.local", ".env.production", ".env.staging"];

let hasViolation = false;

// Check staged files
try {
  const staged = execSync("git diff --cached --name-only", { encoding: "utf-8" }).trim();
  for (const line of staged.split("\n").filter(Boolean)) {
    if (FORBIDDEN_PATTERNS.some((p) => line === p || line.endsWith(`/${p}`))) {
      console.error(`❌ BLOCKED: "${line}" is staged for commit. Environment files must never be committed.`);
      hasViolation = true;
    }
  }
} catch {
  // Not in a git repo or git not available — skip
}

// Check tracked files
try {
  const tracked = execSync("git ls-files", { encoding: "utf-8" }).trim();
  for (const line of tracked.split("\n").filter(Boolean)) {
    if (FORBIDDEN_PATTERNS.some((p) => line === p || line.endsWith(`/${p}`))) {
      console.error(`❌ TRACKED: "${line}" is tracked by git. Remove it: git rm --cached ${line}`);
      hasViolation = true;
    }
  }
} catch {
  // Not in a git repo — skip
}

if (hasViolation) {
  console.error("\n🔒 Environment files contain secrets and must never be committed.");
  process.exit(1);
} else {
  console.log("✅ No environment files staged or tracked.");
}
