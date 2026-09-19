import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../app/api/whatsapp/dispatch/route.ts", import.meta.url),
  "utf8",
);

test("legacy WhatsApp dispatch fails closed", () => {
  assert.match(route, /status:\s*410/);
  assert.match(route, /appointment-reminder-dispatch/);
  assert.doesNotMatch(route, /reminder_events\?channel/);
  assert.doesNotMatch(route, /WHATSAPP_ACCESS_TOKEN/);
  assert.doesNotMatch(route, /MESSAGE_DISPATCH_SECRET/);
});
