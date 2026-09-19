import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("../app/app/clinic-operations/workspace.tsx", import.meta.url), "utf8");

test("roster pre-dispatch check blocks missing contact consent and exceptions without dispatching", () => {
  assert.match(workspace, /Run pre-dispatch check/);
  assert.match(workspace, /missing number/);
  assert.match(workspace, /consent not recorded/);
  assert.match(workspace, /schedule or delivery exception/);
  assert.doesNotMatch(workspace.match(/function runPreDispatchCheck\(\)[\s\S]*?\n  }/)?.[0] ?? "", /fetch\(/);
});
