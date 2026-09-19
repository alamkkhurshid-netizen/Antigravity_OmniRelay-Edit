import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../supabase/migrations/20260815121000_rate_limit_public_booking_reads.sql",import.meta.url),"utf8");

test("public booking reads and token actions have bounded request limits",()=>{
  for(const bucket of [
    "public_booking_page","public_booking_slots","public_booking_manage_lookup",
    "public_booking_identity","public_booking_cancel","public_booking_reschedule",
  ]) assert.match(sql,new RegExp(bucket));
  assert.match(sql,/current_hits > p_limit/i);
  assert.match(sql,/p_window_seconds < 60[\s\S]*?p_window_seconds > 3600/i);
});

test("rate-limit identities are pseudonymous and raw request data is not stored",()=>{
  assert.match(sql,/extensions\.hmac/i);
  assert.match(sql,/edge_functions_token/i);
  assert.match(sql,/private\.api_rate_limits/i);
  assert.doesNotMatch(sql,/insert into private\.api_rate_limits[\s\S]*?(p_scope|client_signal)/i);
});

test("public RPC signatures remain stable while core implementations become private",()=>{
  for(const fn of [
    "get_public_booking_page","get_public_booking_slots","get_customer_booking",
    "attach_public_booking_identity","cancel_customer_booking","reschedule_customer_booking",
  ]){
    assert.match(sql,new RegExp(`create function public\\.${fn}`));
    assert.match(sql,new RegExp(`grant execute on function public\\.${fn}`));
  }
  assert.match(sql,/set schema private/i);
  assert.match(sql,/from public, anon, authenticated/i);
});
