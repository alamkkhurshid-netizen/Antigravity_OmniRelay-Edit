import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration=fs.readFileSync(new URL("../supabase/migrations/20260815123500_server_bound_public_booking_management.sql",import.meta.url),"utf8");
const route=fs.readFileSync(new URL("../app/api/public-booking/manage/route.ts",import.meta.url),"utf8");
const manager=fs.readFileSync(new URL("../app/booking/manage/booking-manager.tsx",import.meta.url),"utf8");
const booking=fs.readFileSync(new URL("../app/book/[slug]/booking-concierge.tsx",import.meta.url),"utf8");

test("manage-token RPCs are service-only",()=>{
  for(const fn of ["get_customer_booking","attach_public_booking_identity","cancel_customer_booking","reschedule_customer_booking"]){
    assert.match(migration,new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]*?from anon,authenticated`,"i"));
  }
  assert.match(migration,/consume_public_server_rate_limit[\s\S]*?to service_role/i);
});

test("server preflight commits independently of rejected token actions",()=>{
  assert.match(route,/consume_public_server_rate_limit/);
  assert.match(route,/limited\?429:503/);
  assert.match(route,/Cache-Control":"no-store/);
  assert.match(route,/Unable to access this booking/);
});

test("public clients use the protected server route",()=>{
  assert.match(manager,/api\/public-booking\/manage/);
  assert.doesNotMatch(manager,/rpc\("get_customer_booking"/);
  assert.doesNotMatch(manager,/rpc\("cancel_customer_booking"/);
  assert.doesNotMatch(manager,/rpc\("reschedule_customer_booking"/);
  assert.match(booking,/api\/public-booking\/manage/);
  assert.doesNotMatch(booking,/rpc\("attach_public_booking_identity"/);
});
