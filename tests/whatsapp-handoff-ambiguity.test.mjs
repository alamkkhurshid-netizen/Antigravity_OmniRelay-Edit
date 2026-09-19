import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/20260815181500_fix_whatsapp_handoff_appointment_ambiguity.sql","utf8");
test("WhatsApp completion never uses an ambiguous appointment identifier",()=>{assert.match(sql,/v_appointment_id uuid/);assert.match(sql,/wbr\.appointment_id=a\.id/);assert.doesNotMatch(sql,/where appointment_id=a\.id/)});
test("handoff completion remains service-role only",()=>{assert.match(sql,/service role required/);assert.match(sql,/revoke all on function public\.complete_whatsapp_booking_handoff\(text,text,text\) from public,anon,authenticated/);assert.match(sql,/grant execute .* to service_role/)});
