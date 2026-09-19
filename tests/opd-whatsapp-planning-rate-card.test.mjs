import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("India planning rate card stays draft and cannot activate billing", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260912233000_draft_india_whatsapp_planning_rate_card.sql", root), "utf8");
  assert.match(migration, /verification_status in \('draft','verified','retired'\)/);
  assert.match(migration, /not active or verification_status = 'verified'/);
  assert.match(migration, /false,'draft'/);
  assert.match(migration, /86\.3100/);
  assert.match(migration, /11\.5000/);
});
