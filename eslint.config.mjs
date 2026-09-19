import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vinext build artifacts are generated from the source checked below.
    "dist/**",
    // Supabase Edge Functions run in Deno and are verified by their dedicated
    // integration tests; the Next.js ESLint runtime is not their type/runtime.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
