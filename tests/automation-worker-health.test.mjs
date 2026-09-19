import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("automation health distinguishes stalled work from overdue retries without patient data", async () => {
  const panel = await readFile(new URL("app/app/automations/automation-control-panel.tsx", root), "utf8");
  const page = await readFile(new URL("app/app/automations/page.tsx", root), "utf8");
  assert.match(panel, /processing.*started_at/);
  assert.match(panel, /nowIso/);
  assert.match(panel, /15 \* 60_000/);
  assert.match(panel, /queued", "retrying/);
  assert.match(panel, /Worker attention required/);
  assert.match(panel, /Worker health normal/);
  assert.match(page, /next_attempt_at,started_at,failure_summary/);
  assert.doesNotMatch(panel, /patient_name|phone|prescription_number/);
});
