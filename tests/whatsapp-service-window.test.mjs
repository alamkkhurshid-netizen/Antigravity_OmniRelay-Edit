import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("free-form WhatsApp replies are blocked after the customer service window", async () => {
  const route = await readFile(new URL("app/api/conversations/reply/route.ts", root), "utf8");
  assert.match(route, /\.eq\("direction", "incoming"\)/);
  assert.match(route, /24 \* 60 \* 60 \* 1000/);
  assert.match(route, /WHATSAPP_SERVICE_WINDOW_CLOSED/);
  assert.match(route, /status: 409/);
});

test("the inbox replaces a closed free-form composer with a template action", async () => {
  const workspace = await readFile(new URL("app/app/conversations/conversation-workspace.tsx", root), "utf8");
  assert.match(workspace, /24-hour reply window closed/);
  assert.match(workspace, /Send approved template/);
  assert.match(workspace, /serviceWindowOpen/);
  assert.match(workspace, /defaultValue=\{templateTarget\?\.phone/);
});
