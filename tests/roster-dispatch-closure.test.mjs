import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("../app/app/clinic-operations/workspace.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../app/app/clinic-operations/use-clinic-operations.ts", import.meta.url), "utf8");
const combined = workspace + "\n" + hook;

test("roster pre-dispatch check blocks missing contact consent and exceptions without dispatching", () => {
  assert.match(workspace, /Run pre-dispatch check/);
  assert.match(combined, /missing number/);
  assert.match(combined, /consent not recorded/);
  assert.match(combined, /schedule or delivery exception/);
  assert.doesNotMatch(hook.match(/function runPreDispatchCheck\(\)[\s\S]*?\n  }/)?.[0] ?? "", /fetch\(/);
});
