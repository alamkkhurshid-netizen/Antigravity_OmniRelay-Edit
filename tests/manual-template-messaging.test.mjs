import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("manual outbound messaging only accepts approved workspace templates", async () => {
  const route = await readFile(new URL("app/api/conversations/start/route.ts", root), "utf8");
  assert.match(route, /channel_message_templates/);
  assert.match(route, /\.eq\("organization_id", organization\.id\)/);
  assert.match(route, /\.eq\("status", "approved"\)/);
  assert.match(route, /Complete the .* template value/);
  assert.match(route, /components: \[\{ type: "body", parameters:/);
});

test("inbox renders approved template choices and their ordered variables", async () => {
  const workspace = await readFile(new URL("app/app/conversations/conversation-workspace.tsx", root), "utf8");
  const page = await readFile(new URL("app/app/conversations/page.tsx", root), "utf8");
  assert.match(page, /channel_message_templates/);
  assert.match(workspace, /Select an approved template/);
  assert.match(workspace, /selectedVariables/);
  assert.match(workspace, /variable:/);
  assert.match(workspace, /organizationName/);
});
