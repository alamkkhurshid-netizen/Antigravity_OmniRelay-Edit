import test from "node:test";
import assert from "node:assert/strict";

function equalBytes(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function validSignature(body, signature, secret) {
  if (!signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const received = Uint8Array.from((signature.slice(7).match(/.{1,2}/g) ?? []).map((value) => Number.parseInt(value, 16)));
  return equalBytes(digest, received);
}

test("Webhook Signature Verification", async (t) => {
  await t.test("Valid signature returns true", async () => {
    const body = JSON.stringify({ test: "data" });
    const secret = "super_secret_key";
    
    // Generate valid signature
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    const signature = "sha256=" + Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('');

    const isValid = await validSignature(body, signature, secret);
    assert.equal(isValid, true);
  });
});
