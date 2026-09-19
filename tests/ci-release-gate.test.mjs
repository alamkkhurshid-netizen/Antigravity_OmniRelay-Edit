import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const workflow=await readFile(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");

test("every main change receives a locked lint, build and test gate",()=>{
  assert.match(workflow,/push:\s*[\s\S]*?branches: \[main\]/);
  assert.match(workflow,/pull_request:\s*[\s\S]*?branches: \[main\]/);
  assert.match(workflow,/node-version: 22/);
  assert.match(workflow,/run: npm ci/);
  assert.match(workflow,/validate:[\s\S]*?run: npm run lint/);
  assert.match(workflow,/validate:[\s\S]*?run: npm run knowledge:release-gate/);
  assert.match(workflow,/validate:[\s\S]*?run: npm test/);
  assert.match(workflow,/fetch-depth: 2/);
});

test("lint cannot be bypassed by an advisory job",()=>{
  assert.doesNotMatch(workflow,/continue-on-error: true/);
});

test("the release gate is read-only and contains no production credentials",()=>{
  assert.match(workflow,/permissions:\s*[\s\S]*?contents: read/);
  assert.doesNotMatch(workflow,/SUPABASE|RAZORPAY|WHATSAPP|META_/i);
});
