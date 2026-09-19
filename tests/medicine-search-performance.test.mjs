import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260809213000_fast_medicine_search.sql", import.meta.url),
  "utf8",
);
const route = await readFile(new URL("../app/api/medicine-catalog/route.ts", import.meta.url), "utf8");
const lookup = await readFile(
  new URL("../app/app/contacts/medicine-lookup.tsx", import.meta.url),
  "utf8",
);

test("medicine search uses bounded prefix indexes and a protected RPC", () => {
  assert.match(migration, /display_prefix_idx/);
  assert.match(migration, /generic_prefix_idx/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /v_limit integer := least\(greatest/);
  assert.match(migration, /revoke all.*from public, anon/is);
  assert.match(migration, /grant execute.*to authenticated/is);
  assert.match(route, /rpc\("search_active_medicines"/);
});

test("medicine type-ahead is debounced, abortable and cached", () => {
  assert.match(lookup, /CACHE_TTL_MS/);
  assert.match(lookup, /new AbortController/);
  assert.match(lookup, /}, 120\);/);
  assert.match(lookup, /resultCache\.set/);
  assert.match(route, /private, max-age=300/);
});
