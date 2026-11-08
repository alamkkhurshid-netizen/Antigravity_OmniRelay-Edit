export * from "./verification/compare-schemas.mjs";
import { runSchemaComparison } from "./verification/compare-schemas.mjs";
import { fileURLToPath } from "url";
import { resolve } from "path";

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runSchemaComparison()
    .then((report) => {
      if (!report.allEqual) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error("[Schema Comparison] Error:", err);
      process.exit(1);
    });
}
