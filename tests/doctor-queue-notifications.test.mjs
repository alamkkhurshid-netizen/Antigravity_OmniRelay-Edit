import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/20260816120000_doctor_queue_notifications.sql",import.meta.url),"utf8");
const tracking=readFileSync(new URL("../supabase/migrations/20260816121000_doctor_queue_delivery_tracking.sql",import.meta.url),"utf8");
const dispatch=readFileSync(new URL("../supabase/functions/doctor-queue-dispatch/index.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/clinic-operations/doctor-queue/route.ts",import.meta.url),"utf8");
const consentLedger=readFileSync(new URL("../supabase/migrations/20260816150000_doctor_queue_consent_ledger.sql",import.meta.url),"utf8");
const rateLimits=readFileSync(new URL("../supabase/migrations/20260822171500_register_clinic_operations_rate_limit_buckets.sql",import.meta.url),"utf8");
const phonePermission=readFileSync(new URL("../supabase/migrations/20260822174500_allow_authenticated_phone_normalization.sql",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../app/app/clinic-operations/workspace.tsx",import.meta.url),"utf8");
const templateHealth=readFileSync(new URL("../app/app/integrations/template-readiness.tsx",import.meta.url),"utf8");

test("doctor queue requires explicit consent and a valid phone",()=>{
  assert.match(migration,/queue_notifications_enabled/);
  assert.match(migration,/whatsapp_queue_consent_at is not null/);
  assert.match(migration,/normalize_phone_identity\(pp\.contact_phone\) is not null/);
  assert.match(consentLedger,/doctor_queue_v1/);
  assert.match(workspace,/Review consent/);
  assert.match(workspace,/queue-consent-backdrop/);
  assert.match(workspace,/role="dialog"[\s\S]*?aria-modal="true"/);
});

test("doctor queue consent is explicit, immutable and organization scoped",()=>{
  assert.match(workspace,/I confirm the doctor explicitly agreed/);
  assert.match(route,/acknowledged!==true/);
  assert.match(route,/set_doctor_queue_consent/);
  assert.match(consentLedger,/doctor_queue_consent_events/);
  assert.match(consentLedger,/private\.is_organization_member\(organization_id, 'admin'\)/);
  assert.match(consentLedger,/revoke all on public\.doctor_queue_consent_events/);
  assert.doesNotMatch(consentLedger,/grant (update|delete)/i);
});

test("clinic operations rate limits recognise every configured bucket and fail clearly",()=>{
  assert.match(rateLimits,/doctor_queue_setting/);
  assert.match(rateLimits,/doctor_queue_manual/);
  assert.match(rateLimits,/doctor_bulk_import/);
  assert.match(route,/error:limitError/);
  assert.match(route,/Notification safety check is temporarily unavailable/);
  assert.match(workspace,/This safety limit has been reached/);
  assert.match(workspace,/no queue message was sent/);
});

test("manual scheduling can normalize consented numbers without weakening admin checks",()=>{
  assert.match(phonePermission,/grant execute on function private\.normalize_phone_identity\(text\)[\s\S]*to authenticated, service_role/);
  assert.match(phonePermission,/revoke all on function private\.normalize_phone_identity\(text\)[\s\S]*from public, anon/);
  assert.match(route,/administrator access required\/i\.test\(error\.message\)/);
  assert.match(route,/Queue notification could not be scheduled safely/);
  assert.match(workspace,/Only a clinic administrator can manage doctor queue notifications/);
});

test("automatic queue is one-hour scheduled, idempotent and bounded",()=>{
  assert.match(migration,/shift\.shift_at - interval '1 hour'/);
  assert.match(migration,/unique \(organization_id, availability_rule_id, shift_date\)/);
  assert.match(migration,/for update skip locked limit least\(greatest\(p_limit,1\),100\)/);
  assert.match(dispatch,/doctor-queue:\$\{item\.id\}:attempt:\$\{item\.attempts\}/);
  assert.match(tracking,/sync_doctor_queue_dispatch_from_message/);
  assert.match(tracking,/delivered_at/);
  assert.match(tracking,/read_at/);
});

test("doctor WhatsApp payload excludes patient identity and requires an approved template",()=>{
  assert.doesNotMatch(dispatch,/customer_name|patient_name|patient_phone|diagnosis|prescription/);
  assert.match(dispatch,/eq\("event_type","doctor_queue"\)\.eq\("status","approved"\)/);
  assert.match(dispatch,/String\(item\.booking_count\)/);
  assert.match(workspace,/Messages exclude patient names and clinical information/);
});

test("template health distinguishes configuration from observed production delivery",()=>{
  assert.match(templateHealth,/Doctor queue update/);
  assert.match(templateHealth,/Live delivery verified/);
  assert.match(templateHealth,/Configured · test pending/);
  assert.match(templateHealth,/doctorDispatches/);
  assert.match(templateHealth,/status==="sent"\|\|row\.status==="delivered"\|\|row\.status==="read"/);
});
