import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("template audit is service-role protected and returns metadata only", async () => {
  const source = await readFile("supabase/functions/whatsapp-template-audit/index.ts", "utf8");
  assert.match(source, /token !== serviceKey/);
  assert.match(source, /message_templates\?fields=name,language,status,category,components/);
  assert.match(source, /body_variable_count/);
  assert.doesNotMatch(source, /return Response\.json\(\{[^}]*accessToken/s);
});
