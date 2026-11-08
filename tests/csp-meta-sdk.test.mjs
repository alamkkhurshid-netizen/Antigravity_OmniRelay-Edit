import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

function parseCsp(cspString) {
  const directives = {};
  const tokens = cspString
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const [name, ...sources] = token.split(/\s+/);
    directives[name] = sources;
  }
  return directives;
}

test("middleware defines a strict Content Security Policy allowing Meta SDK and blocking unapproved origins", async () => {
  const middlewareContent = await readFile(new URL("middleware.ts", root), "utf8");

  // Extract cspHeader string literal
  const cspMatch = middlewareContent.match(/const cspHeader =\s*`([\s\S]*?)`\.replace/);
  assert.ok(cspMatch, "middleware.ts must define cspHeader");

  const rawCsp = cspMatch[1].replace(/\s{2,}/g, " ").trim();
  const directives = parseCsp(rawCsp);

  // 1. Validate script-src allows Meta SDK
  assert.ok(directives["script-src"], "script-src directive must exist");
  assert.ok(
    directives["script-src"].includes("https://connect.facebook.net"),
    "script-src must include https://connect.facebook.net for Meta SDK"
  );
  assert.ok(
    !directives["script-src"].includes("*") && !directives["script-src"].includes("https:"),
    "script-src must not allow blanket wildcard origins"
  );

  // 2. Validate frame-src allows Facebook frames
  assert.ok(directives["frame-src"], "frame-src directive must exist");
  assert.ok(
    directives["frame-src"].includes("https://www.facebook.com"),
    "frame-src must include https://www.facebook.com"
  );
  assert.ok(
    directives["frame-src"].includes("https://web.facebook.com"),
    "frame-src must include https://web.facebook.com"
  );
  assert.ok(
    !directives["frame-src"].includes("*") && !directives["frame-src"].includes("https:"),
    "frame-src must not allow blanket wildcard origins"
  );

  // 3. Validate connect-src allows Meta Graph endpoints
  assert.ok(directives["connect-src"], "connect-src directive must exist");
  assert.ok(
    directives["connect-src"].includes("https://graph.facebook.com"),
    "connect-src must include https://graph.facebook.com"
  );
  assert.ok(
    directives["connect-src"].includes("https://*.facebook.com"),
    "connect-src must include https://*.facebook.com"
  );
  assert.ok(
    directives["connect-src"].includes("https://connect.facebook.net"),
    "connect-src must include https://connect.facebook.net"
  );
  assert.ok(
    !directives["connect-src"].includes("*"),
    "connect-src must not allow blanket wildcard origins"
  );

  // 4. Validate core baseline security controls are intact
  assert.deepEqual(directives["default-src"], ["'self'"]);
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.deepEqual(directives["base-uri"], ["'self'"]);
  assert.deepEqual(directives["form-action"], ["'self'"]);
  assert.deepEqual(directives["frame-ancestors"], ["'none'"]);

  // 5. Explicit check against unapproved origins
  const unapprovedOrigins = [
    "https://evil-analytics.com",
    "https://attacker.net",
    "http://insecure-cdn.com",
    "https://connect.facebook.com", // should be connect.facebook.net
  ];

  for (const origin of unapprovedOrigins) {
    assert.strictEqual(
      directives["script-src"].includes(origin),
      false,
      `script-src must block unapproved origin ${origin}`
    );
    assert.strictEqual(
      directives["frame-src"].includes(origin),
      false,
      `frame-src must block unapproved origin ${origin}`
    );
  }
});
