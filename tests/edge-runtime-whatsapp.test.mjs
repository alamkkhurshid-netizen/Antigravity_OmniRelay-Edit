import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const APP_SECRET = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "test_app_secret";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || "test_verify_token";

function invokeEdgeRuntime({ method = "GET", path, headers = {}, body = null, bodyFile = null }) {
  const args = [
    "exec",
    "supabase_db_Omnirelay-main",
    "curl",
    "-s",
    "-w",
    "\n%{http_code}",
    "--connect-timeout",
    "5",
    "-X",
    method,
  ];

  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }

  if (bodyFile !== null) {
    args.push("--data-binary", `@${bodyFile}`);
  } else if (body !== null) {
    args.push("-d", body);
  }

  args.push(`http://edge_runtime:8081${path}`);

  const output = execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const lastNewline = output.lastIndexOf("\n");
  const responseBody = output.slice(0, lastNewline).trim();
  const statusCode = parseInt(output.slice(lastNewline + 1).trim(), 10);

  return { status: statusCode, body: responseBody };
}

function computeHmac(secret, body) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function isEdgeRuntimeActive() {
  try {
    const res = execFileSync("docker", [
      "exec",
      "supabase_db_Omnirelay-main",
      "curl",
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "--connect-timeout",
      "2",
      "http://edge_runtime:8081/whatsapp-webhook?hub.mode=subscribe",
    ], { encoding: "utf8", timeout: 4000 }).trim();
    return res === "403" || res === "200";
  } catch {
    return false;
  }
}

test("Supabase Edge Runtime: WhatsApp Function Compilation & Invariant Verification", async (t) => {
  if (!isEdgeRuntimeActive()) {
    t.skip("Supabase local Edge Runtime is not actively serving on port 8081 (start with 'supabase functions serve --no-verify-jwt' to run)");
    return;
  }

  // --------------------------------------------------------------------------
  // 1. GET verification
  // --------------------------------------------------------------------------
  await t.test("1. GET verification returns challenge for valid subscription", async () => {
    const challenge = "test_meta_challenge_" + Date.now();
    const res = invokeEdgeRuntime({
      method: "GET",
      path: `/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${challenge}`,
    });

    assert.equal(res.status, 200, "Must return HTTP 200");
    assert.equal(res.body, challenge, "Must echo back challenge string exactly");
  });

  // --------------------------------------------------------------------------
  // 2. Invalid HMAC rejected with 401
  // --------------------------------------------------------------------------
  await t.test("2. Invalid HMAC returns 401 Unauthorized", async () => {
    const payload = JSON.stringify({ object: "whatsapp_business_account" });
    const res = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-webhook",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": "sha256=invalid_tampered_signature_hex_00000000000000000000000000000000",
      },
      body: payload,
    });

    assert.equal(res.status, 401, "Must return HTTP 401 for invalid HMAC");
    assert.match(res.body, /Unauthorized/);
  });

  // --------------------------------------------------------------------------
  // 3. Valid HMAC accepted
  // --------------------------------------------------------------------------
  await t.test("3. Valid HMAC returns 200 OK", async () => {
    const payload = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const signature = computeHmac(APP_SECRET, payload);

    const res = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-webhook",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature,
      },
      body: payload,
    });

    assert.equal(res.status, 200, "Must return HTTP 200 for valid HMAC signature");
    assert.equal(res.body, "OK", "Webhook returns OK on successful processing");
  });

  // --------------------------------------------------------------------------
  // 4. /onboard management route
  // --------------------------------------------------------------------------
  await t.test("4. /onboard management route is reachable and validates input", async () => {
    const payload = JSON.stringify({ token: "invalid_expired_token", code: "fake_code" });
    const res = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-management/onboard",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload,
    });

    // Validates request reaches /onboard endpoint in Edge Runtime without 404
    assert.notEqual(res.status, 404, "Management route /onboard must exist (not 404)");
  });

  // --------------------------------------------------------------------------
  // 5. Template route
  // --------------------------------------------------------------------------
  await t.test("5. Template route enforces role authorization (401 Missing token)", async () => {
    const res = invokeEdgeRuntime({
      method: "PUT",
      path: "/whatsapp-management/templates",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organization_id: "test", organization_address: "test" }),
    });

    assert.equal(res.status, 401, "Must enforce authorization header");
    assert.match(res.body, /Missing authorization token/);
  });

  // --------------------------------------------------------------------------
  // 6. Payload-size rejection (413)
  // --------------------------------------------------------------------------
  await t.test("6. Payload-size rejection: exceeds 1 MB returns HTTP 413", async () => {
    // Ensure /tmp/large_payload.bin exists inside the container (1048577 bytes > 1MB)
    execFileSync("docker", [
      "exec",
      "supabase_db_Omnirelay-main",
      "sh",
      "-c",
      "head -c 1048577 /dev/zero > /tmp/large_payload.bin",
    ]);

    const res = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-webhook",
      headers: {
        "Content-Type": "text/plain",
      },
      bodyFile: "/tmp/large_payload.bin",
    });

    assert.equal(res.status, 413, "Must reject >1MB payload with HTTP 413");
    assert.match(res.body, /Payload Too Large/);
  });

  // --------------------------------------------------------------------------
  // 7. Malformed JSON returns 400 Bad Request
  // --------------------------------------------------------------------------
  await t.test("7. Malformed JSON returns HTTP 400 Bad Request", async () => {
    const malformedBody = '{"object": "whatsapp_business_account", unclosed_json: ';
    const signature = computeHmac(APP_SECRET, malformedBody);

    const res = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-webhook",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature,
      },
      body: malformedBody,
    });

    assert.equal(res.status, 400, "Malformed JSON must yield HTTP 400");
    assert.equal(res.body, "Bad Request", "Malformed JSON yields HTTP 400 Bad Request");
  });

  // --------------------------------------------------------------------------
  // 8. Duplicate message handling
  // --------------------------------------------------------------------------
  await t.test("8. Duplicate message handling: acknowledges webhook idempotently", async () => {
    const messageId = "wamid.edge.dup." + Date.now();
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_edge_test",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "+15551234567",
                  phone_number_id: "phone_edge_test_unmapped",
                },
                messages: [
                  {
                    from: "+15559998888",
                    id: messageId,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Duplicate test" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const signature = computeHmac(APP_SECRET, payload);

    // Call 1
    const res1 = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-webhook",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
      body: payload,
    });
    assert.equal(res1.status, 200, "First invocation returns 200");

    // Call 2 (duplicate)
    const res2 = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-webhook",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
      body: payload,
    });
    assert.equal(res2.status, 200, "Second duplicate invocation must also return 200 idempotently");
  });

  // --------------------------------------------------------------------------
  // 9. Unmapped recipient acknowledged safely
  // --------------------------------------------------------------------------
  await t.test("9. Unmapped recipient returns HTTP 200 (Meta acknowledgement)", async () => {
    const payload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba_unmapped_test",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "+15551112222",
                  phone_number_id: "phone_completely_unmapped_999",
                },
                messages: [
                  {
                    from: "+15550001111",
                    id: "wamid.unmapped." + Date.now(),
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Hello unmapped" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const signature = computeHmac(APP_SECRET, payload);

    const res = invokeEdgeRuntime({
      method: "POST",
      path: "/whatsapp-webhook",
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
      body: payload,
    });

    assert.equal(res.status, 200, "Unmapped recipient must return HTTP 200 so Meta does not retry indefinitely");
    assert.equal(res.body, "OK", "Webhook returns OK on unmapped recipient");
  });
});
