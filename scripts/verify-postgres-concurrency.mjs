export * from "./verification/verify-postgres-concurrency.mjs";
import { runPostgresConcurrencyTest } from "./verification/verify-postgres-concurrency.mjs";
import { fileURLToPath } from "url";
import { resolve } from "path";

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runPostgresConcurrencyTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[Postgres Concurrency Test] Failure:", err);
      process.exit(1);
    });
}
