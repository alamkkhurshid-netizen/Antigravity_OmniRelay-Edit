import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20260815104500_close_rpc_execution_surface.sql",import.meta.url),"utf8");

test("legacy booking and payment writes are server-only",()=>{
  for(const name of ["create_public_appointment","create_public_payment_intent","create_public_payment_intent_v2","create_public_payment_intent_v3","attach_public_payment_order","confirm_public_payment"]){
    assert.match(sql,new RegExp(`revoke execute on function public\\.${name}[\\s\\S]{0,240}from public, anon, authenticated`,`i`));
  }
});

test("patient self-service keeps only explicitly documented public RPCs",()=>{
  assert.match(sql,/grant execute on function public\.create_public_appointment_v2[\s\S]*?to anon, authenticated, service_role/i);
  assert.match(sql,/grant execute on function public\.get_customer_booking[\s\S]*?to anon, authenticated, service_role/i);
  assert.match(sql,/hashed high-entropy manage token/i);
});

test("permission and retrieval helpers bind authenticated callers to tenant identity",()=>{
  assert.match(sql,/caller <> _user_id/);
  assert.match(sql,/private\.is_organization_member\(p_organization_id, 'member'\)/);
  assert.match(sql,/match_count < 1 or match_count > 50/);
  assert.match(sql,/from public, anon/);
});
