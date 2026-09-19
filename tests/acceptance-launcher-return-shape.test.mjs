import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql=readFileSync(new URL("../supabase/migrations/20260824031828_acceptance_launcher_composite_return_fix.sql",import.meta.url),"utf8");
test("acceptance launchers expand composite RPC returns into row variables",()=>{
  assert.match(sql,/select \* into result from private\.arm_whatsapp_acceptance_test_from_delivery/i);
  assert.match(sql,/select \* into run from private\.arm_whatsapp_acceptance_test_from_delivery/i);
  assert.doesNotMatch(sql,/select private\.arm_whatsapp_acceptance_test_from_delivery[\s\S]{0,250}into (result|run)/i);
});
test("fixed launchers remain service-only",()=>{
  assert.match(sql,/revoke all on function public\.prepare_whatsapp_acceptance_scenario\(uuid,text\) from public,anon,authenticated/i);
  assert.match(sql,/revoke all on function public\.prepare_abandoned_recovery_acceptance\(uuid\) from public,anon,authenticated/i);
});
