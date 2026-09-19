import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("the inbox observes Realtime status and recovers safely when the channel is unavailable", async () => {
  const workspace = await readFile(new URL("app/app/conversations/conversation-workspace.tsx", root), "utf8");

  assert.match(workspace, /\.subscribe\(\(status\) =>/);
  assert.match(workspace, /status === "SUBSCRIBED"/);
  assert.match(workspace, /"CHANNEL_ERROR"/);
  assert.match(workspace, /"TIMED_OUT"/);
  assert.match(workspace, /function recoverLiveUpdates/);
  assert.match(workspace, /\.from\("messages"\)/);
  assert.match(workspace, /\.from\("conversations"\)/);
  assert.match(workspace, /window\.setInterval\(\(\) => void recoverLiveUpdates\(\), 3000\)/);
});
