import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("the product knowledge release record stays versioned and verified", () => {
  const manifest = JSON.parse(readFileSync("docs/knowledge/release-manifest.json", "utf8"));
  const release = manifest.releases.find((item) => item.id === manifest.latest_release);
  assert.ok(release);
  assert.ok(existsSync(release.record));
  assert.equal(release.guide_reviewed_on, "2026-09-13");
  assert.ok(Array.isArray(release.guide_articles) && release.guide_articles.length > 0);
  assert.ok(["guide_only", "tenant_indexing", "none"].includes(release.rag_impact));
});
