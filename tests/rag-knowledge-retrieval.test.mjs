import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("knowledge retrieval remains cited, tenant-bound and non-clinical", async () => {
  const [migration, incrementalMigration, indexRoute, previewRoute, embeddingHelper, guide] = await Promise.all([
    readFile(new URL("supabase/migrations/20260912150000_rag_knowledge_retrieval_citations.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260912162000_incremental_rag_indexing.sql", root), "utf8"),
    readFile(new URL("app/api/agents/index/route.ts", root), "utf8"),
    readFile(new URL("app/api/agents/preview/route.ts", root), "utf8"),
    readFile(new URL("lib/rag-embeddings.ts", root), "utf8"),
    readFile(new URL("lib/omni-relay-guide.ts", root), "utf8"),
  ]);
  assert.match(migration, /match_rag_knowledge_chunks/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /item\.status = 'approved'/);
  assert.match(migration, /item\.source_type in \('faq', 'policy', 'service', 'business_info'\)/);
  assert.match(migration, /revoke all on table public\.knowledge_chunks from anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]*?to service_role/);
  assert.match(incrementalMigration, /source_updated_at/);
  assert.match(incrementalMigration, /kc\.source_updated_at = item\.updated_at/);
  assert.match(indexRoute, /Only a workspace owner or admin can index knowledge/);
  assert.match(indexRoute, /const permittedSources = new Set\(\["faq", "policy", "service", "business_info"\]\)/);
  assert.doesNotMatch(indexRoute, /clinical_guidance/);
  assert.match(indexRoute, /changedChunks/);
  assert.match(indexRoute, /retainedIds/);
  assert.match(indexRoute, /changedChunks/);
  assert.match(previewRoute, /match_rag_knowledge_chunks/);
  assert.match(previewRoute, /safe lexical fallback/);
  assert.match(embeddingHelper, /outputDimensionality: embeddingDimensions/);
  assert.match(embeddingHelper, /RETRIEVAL_DOCUMENT/);
  assert.match(guide, /Follow-up Desk and medication reminders/);
  assert.match(guide, /Doctor-specific emergency notices/);
  assert.match(guide, /Multi-doctor OPD setup and continuity/);
});
