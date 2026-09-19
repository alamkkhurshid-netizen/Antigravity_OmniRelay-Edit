import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260811090201_pin_remaining_function_search_paths.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("all six remaining functions receive immutable search paths", () => {
  for (const signature of [
    "before_insert_on_messages()",
    "merge_update()",
    "pause_conversation_on_human_message()",
    "preserve_message_direction()",
    "has_permission(uuid, uuid, text)",
  ]) {
    const escaped = signature.replace(/[(), ]/g, (value) =>
      value === " " ? "\\s*" : `\\${value}`,
    );
    assert.match(migration, new RegExp(`alter function public\\.${escaped}\\s*set search_path = ''`));
  }
  assert.match(migration, /match_knowledge_chunks[\s\S]*?set search_path = ''/);
});

test("vector distance operator is schema-qualified under an empty path", () => {
  const occurrences = migration.match(/operator\(public\.<=>\)/g) ?? [];
  assert.equal(occurrences.length, 3);
});
