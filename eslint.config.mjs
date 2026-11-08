import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Project-wide rules: preserve strictness while aligning rule severities with Next.js standards
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Node / CommonJS scripts allow standard require imports
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vinext build artifacts are generated from the source checked below.
    "dist/**",
    // Scratch scripts and local artifacts
    "scratch/**",
    ".sites-runtime/**",
    ".agents/**",
    ".wrangler/**",
    ".vinext/**",
    // Supabase Edge Functions run in Deno and are verified by their dedicated
    // integration tests; the Next.js ESLint runtime is not their type/runtime.
    "supabase/functions/**",
    // Playwright E2E tests and configurations
    "e2e/**",
    "playwright.config.ts",
  ]),
]);

export default eslintConfig;
