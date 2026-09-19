import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260811083021_harden_internal_security_definer_functions.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("backend-only functions are unavailable through public Data API roles", () => {
  for (const signature of [
    "public.record_webhook_event(text, text, uuid)",
    "public.track_conversation_usage(uuid, text)",
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[().]/g, "\\$&")}`));
  }
  assert.match(migration, /from public, anon, authenticated/);
});

test("anonymous callers cannot invoke authorization or knowledge helpers", () => {
  assert.match(migration, /public\.has_permission\(uuid, uuid, text\)[\s\S]*?from public, anon/);
  assert.match(migration, /public\.match_knowledge_chunks\(vector, double precision, integer, uuid\)[\s\S]*?from public, anon/);
});

test("privileged backend helpers have immutable search paths", () => {
  assert.match(migration, /alter function public\.record_webhook_event\(text, text, uuid\)[\s\S]*?set search_path = ''/);
  assert.match(migration, /alter function public\.track_conversation_usage\(uuid, text\)[\s\S]*?set search_path = ''/);
});
