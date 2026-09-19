import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const manifestPath = "docs/knowledge/release-manifest.json";
const productSource = /^(app\/|components\/|lib\/|supabase\/migrations\/).+\.(?:ts|tsx|sql)$/;

let changed = [];
try {
  changed = execFileSync("git", ["diff", "--name-only", "HEAD^", "HEAD"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
} catch {
  console.log("Knowledge release gate skipped: no previous Git revision is available.");
  process.exit(0);
}

if (!changed.some((path) => productSource.test(path))) {
  console.log("Knowledge release gate passed: no functional product source changed.");
  process.exit(0);
}
if (!changed.includes(manifestPath)) {
  throw new Error("Functional product source changed without updating docs/knowledge/release-manifest.json.");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const release = manifest.releases?.find((item) => item.id === manifest.latest_release);
if (!release?.record || !Array.isArray(release.guide_articles) || !release.guide_articles.length || !release.rag_impact) {
  throw new Error("The latest knowledge release record is incomplete.");
}
if (!existsSync(release.record) || !changed.includes(release.record)) {
  throw new Error("The latest knowledge release record must exist and be updated in the same release.");
}
console.log(`Knowledge release gate passed: ${release.id}.`);
