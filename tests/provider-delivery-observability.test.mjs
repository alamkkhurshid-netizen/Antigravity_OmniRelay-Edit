import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("provider failures have safe actionable mappings", async () => {
  const source = await readFile(new URL("lib/whatsapp-delivery.ts", root), "utf8");
  for (const code of ["131047", "131030", "131042", "132001", "190"]) assert.match(source, new RegExp(`"${code}"`));
  assert.match(source, /approved template/i);
  assert.doesNotMatch(source, /fbtrace_id|contact_address|phone number not in allowed list:/i);
});

test("failure trigger records safe operations and alerts only administrators", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260810120000_provider_delivery_observability.sql", root), "utf8");
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /recent_failures >= 3/);
  assert.match(migration, /in \('owner','admin'\)/);
  assert.match(migration, /interval '1 hour'/);
  assert.match(migration, /on conflict do nothing/);
  assert.doesNotMatch(migration, /contact_address|content->|provider_error->>'message'/);
});

test("inbox and operations centre surface provider guidance", async () => {
  const [inbox, operations] = await Promise.all([
    readFile(new URL("app/app/conversations/conversation-workspace.tsx", root), "utf8"),
    readFile(new URL("app/app/operations/page.tsx", root), "utf8"),
  ]);
  assert.match(inbox, /Review operations/);
  assert.match(inbox, /Review operations/);
  assert.match(operations, /PROVIDER DIAGNOSTICS/);
  assert.match(operations, /failureCategoryLabel/);
});
