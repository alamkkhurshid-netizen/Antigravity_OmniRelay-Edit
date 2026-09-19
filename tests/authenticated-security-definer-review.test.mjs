import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260815112000_restrict_unused_authenticated_security_definers.sql", import.meta.url),
  "utf8",
);

test("unused privileged helpers are backend-only", () => {
  assert.match(
    migration,
    /has_permission\(uuid, uuid, text\)[\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /match_knowledge_chunks\([\s\S]*?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /has_permission\(uuid, uuid, text\)[\s\S]*?to service_role/i,
  );
  assert.match(
    migration,
    /match_knowledge_chunks\([\s\S]*?to service_role/i,
  );
});

test("review does not revoke live booking or staff-operation RPCs", () => {
  for (const functionName of [
    "create_public_appointment_v2",
    "get_public_booking_page",
    "get_public_booking_slots",
    "get_customer_booking",
    "cancel_customer_booking",
    "reschedule_customer_booking",
    "decide_whatsapp_booking_request",
    "consume_api_rate_limit",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`revoke execute on function public\\.${functionName}`, "i"),
    );
  }
});
