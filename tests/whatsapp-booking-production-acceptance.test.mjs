import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {bookingMenu,isResetCommand,isStopCommand,relationshipForChoice} from "../supabase/functions/whatsapp-booking-concierge/policy.mjs";

const concierge=readFileSync(new URL("../supabase/functions/whatsapp-booking-concierge/index.ts",import.meta.url),"utf8");
const idempotency=readFileSync(new URL("../supabase/migrations/20260815094500_idempotent_whatsapp_booking_handoffs.sql",import.meta.url),"utf8");
const consent=readFileSync(new URL("../supabase/migrations/20260815065000_whatsapp_web_handoff_closure.sql",import.meta.url),"utf8");
const overlap=readFileSync(new URL("../supabase/migrations/20260727090000_booking_payment_foundation.sql",import.meta.url),"utf8");
const nativeManagement=readFileSync(new URL("../supabase/migrations/20260815125000_whatsapp_native_appointment_management.sql",import.meta.url),"utf8");
const startRecovery=readFileSync(new URL("../supabase/migrations/20260815193000_whatsapp_start_consent_recovery.sql",import.meta.url),"utf8");
const acceptanceEvidence=readFileSync(new URL("../supabase/migrations/20260823121204_whatsapp_booking_acceptance_evidence.sql",import.meta.url),"utf8");
const acceptanceRunner=readFileSync(new URL("../supabase/migrations/20260823130830_automated_booking_acceptance_runner.sql",import.meta.url),"utf8");
const closureRunner=readFileSync(new URL("../supabase/migrations/20260823131923_booking_acceptance_closure_runner.sql",import.meta.url),"utf8");
const channelHarness=readFileSync(new URL("../supabase/migrations/20260823135423_controlled_whatsapp_acceptance_harness.sql",import.meta.url),"utf8");
const executionController=readFileSync(new URL("../supabase/migrations/20260823135836_whatsapp_acceptance_execution_controller.sql",import.meta.url),"utf8");
const verifiedRecipientBinding=readFileSync(new URL("../supabase/migrations/20260823141902_bind_verified_acceptance_recipient.sql",import.meta.url),"utf8");
const depositReconciliation=readFileSync(new URL("../supabase/migrations/20260823142813_deposit_acceptance_reconciliation.sql",import.meta.url),"utf8");
const depositLauncher=readFileSync(new URL("../supabase/migrations/20260823145222_deposit_acceptance_launcher.sql",import.meta.url),"utf8");
const depositDispatcher=readFileSync(new URL("../supabase/migrations/20260823145937_deposit_acceptance_dispatcher.sql",import.meta.url),"utf8");
const depositDispatchFunction=readFileSync(new URL("../supabase/functions/deposit-acceptance-dispatch/index.ts",import.meta.url),"utf8");
const isolatedFixture=readFileSync(new URL("../supabase/migrations/20260823154928_isolated_deposit_acceptance_fixture.sql",import.meta.url),"utf8");
const depositRateLimit=readFileSync(new URL("../supabase/migrations/20260823162500_register_deposit_acceptance_rate_limit.sql",import.meta.url),"utf8");
const secureDepositPreparation=readFileSync(new URL("../supabase/migrations/20260823163500_secure_deposit_acceptance_preparation.sql",import.meta.url),"utf8");
const depositTestRoute=readFileSync(new URL("../app/api/readiness/deposit-test/route.ts",import.meta.url),"utf8");

test("new and returning patients receive the correct privacy-safe menu",()=>{
  assert.doesNotMatch(bookingMenu("Welcome"),/Repeat my last appointment/);
  assert.match(bookingMenu("Welcome","Synthetic Patient"),/Welcome back, Synthetic Patient/);
  assert.match(bookingMenu("Welcome","Synthetic Patient"),/Repeat my last appointment/);
  assert.doesNotMatch(bookingMenu("Welcome","Synthetic Patient"),/diagnosis|medicine|report/i);
});

test("guardian and dependent choices remain distinct from self",()=>{
  assert.deepEqual([1,2,3,4,5].map(relationshipForChoice),["self","child","parent","spouse","relative"]);
  assert.equal(relationshipForChoice("6"),null);
  assert.match(concierge,/Booked by:[\s\S]*patient_relationship/);
  assert.match(concierge,/booking_contact_name/);
});

test("MENU START and STOP commands are deterministic",()=>{
  for(const command of ["hi","hello","book","menu","start"," START "])assert.equal(isResetCommand(command),true);
  for(const command of ["stop","unsubscribe","opt out","OPT-OUT"])assert.equal(isStopCommand(command),true);
  assert.match(concierge,/opted_out:true/);
  assert.match(concierge,/Marketing remains off unless you give separate consent/);
  assert.match(concierge,/rpc\("restore_whatsapp_care_consent"/);
  assert.match(concierge,/lower==="start"/);
  assert.match(startRecovery,/scope in \('all', 'care'\)/);
  assert.match(startRecovery,/'marketing'/);
  assert.match(startRecovery,/marketing_consent = false/);
  assert.match(startRecovery,/record_whatsapp_identity_verification/);
  assert.match(startRecovery,/whatsapp_preference_events/);
  assert.doesNotMatch(concierge,/lower==="menu"[\s\S]{0,200}restore_whatsapp_care_consent/);
});

test("expired sessions recover safely and human handoff can be explicitly resumed",()=>{
  assert.match(concierge,/recoveredExpiredSession/);
  assert.match(concierge,/previous booking session expired/);
  assert.match(concierge,/ai_paused: true/);
  assert.match(concierge,/ai_paused:false,paused_at:null/);
  assert.match(concierge,/automated concierge is now paused/);
});

test("consent evidence and WhatsApp possession are recorded before booking",()=>{
  assert.match(concierge,/record_whatsapp_booking_consent/);
  assert.match(concierge,/p_notice_version:"whatsapp-booking-v1"/);
  assert.match(consent,/consent_evidence_id uuid not null/);
  assert.doesNotMatch(idempotency,/update public\.patient_identity_verification_events/);
  assert.match(concierge,/communication_opt_outs"\)\.delete\(\)/);
  assert.match(concierge,/\.in\("scope",\["all","care"\]\)/);
  assert.match(concierge,/context\.consent_source_message_id=message\.id/);
  assert.match(concierge,/p_source_message_id:context\.consent_source_message_id/);
});

test("patients choose pay-at-clinic or an online payment handoff",()=>{
  assert.match(concierge,/state==="payment"/);
  assert.match(concierge,/Choose payment method/);
  assert.match(concierge,/pay_at_location:"Pay at clinic"/);
  assert.match(concierge,/deposit_online:"Pay deposit"/);
  assert.match(concierge,/full_online:"Pay now"/);
  assert.match(concierge,/consultation fee/);
  assert.match(concierge,/allowed_payment_modes,price_paise,deposit_paise/);
  assert.doesNotMatch(concierge,/context\.payment_modes\.length===1return await finishBooking/);
  assert.match(concierge,/checkout\.searchParams\.set\("payment",selectedPaymentMode\)/);
  assert.match(concierge,/selectedPaymentMode!=="pay_at_location"/);
});

test("WhatsApp My bookings supports native reschedule and cancellation",()=>{
  assert.match(concierge,/manage_booking_select/);
  assert.match(concierge,/manage_cancel_confirm/);
  assert.match(concierge,/manage_reschedule_slot/);
  assert.match(concierge,/rpc\("manage_whatsapp_appointment"/);
  assert.match(nativeManagement,/WhatsApp identity could not be verified/);
  assert.match(nativeManagement,/booking_contact_phone/);
  assert.match(nativeManagement,/for update/);
  assert.match(nativeManagement,/exception when exclusion_violation/);
  assert.match(nativeManagement,/revoke all on function public\.manage_whatsapp_appointment/);
});

test("partial handoffs recover the same appointment without duplicate confirmation",()=>{
  assert.match(idempotency,/if h\.appointment_id is not null/);
  assert.match(idempotency,/replacement_token:=encode/);
  assert.match(idempotency,/not exists\(select 1 from public\.messages/);
  assert.match(concierge,/data:recovered/);
  assert.match(concierge,/recovered\.booking_reference/);
});

test("live slot creation remains protected by the appointment exclusion constraint",()=>{
  assert.match(overlap,/exclude using gist/);
  assert.match(overlap,/tstzrange\(starts_at, ends_at, '\[\)'\) with &&/);
  assert.match(concierge,/get_public_booking_slots/);
});

test("manual approvals surface failures instead of claiming success",()=>{
  assert.match(concierge,/error:requestError/);
  assert.match(concierge,/could not place this request safely/);
  assert.match(concierge,/pending_approval/);
});

test("all bounded booking choices are presented as WhatsApp selections",()=>{
  for(const label of ["Open menu","Choose service","Choose chamber","Choose doctor","Choose date","Choose time","Choose patient"]){
    assert.match(concierge,new RegExp(`sendList\\([\\s\\S]{0,500}${label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`));
  }
  assert.match(concierge,/sendButtons\(`Confirm this booking/);
  assert.match(concierge,/sendButtons\(`\$\{consentNotice\}/);
});

test("large live slot sets remain fully selectable through pagination",()=>{
  assert.match(concierge,/const pageSize=8/);
  assert.match(concierge,/id:"slots_prev"/);
  assert.match(concierge,/id:"slots_next"/);
  assert.match(concierge,/inbound==="slots_next"\|\|inbound==="slots_prev"/);
});

test("welcome menu prefers deliberate booking and practical clinic help",()=>{
  assert.match(bookingMenu("Welcome"),/Choose appointment \(Recommended\)/);
  assert.doesNotMatch(bookingMenu("Welcome"),/Quick booking/);
  assert.match(concierge,/id:"5",title:"Doctor directory & PDF"/);
  assert.match(concierge,/id:"6",title:"Timings & location"/);
  assert.match(concierge,/id:"7",title:"Speak to front desk"/);
  assert.match(concierge,/const sendDirectoryBrochure/);
  assert.match(concierge,/const sendClinicInfo/);
  assert.match(concierge,/const sendFrontDesk/);
});

test("production acceptance evidence is tenant-scoped and service-recorded",()=>{
  assert.match(acceptanceEvidence,/alter table public\.whatsapp_booking_acceptance_checks enable row level security/i);
  assert.match(acceptanceEvidence,/private\.is_organization_member\(organization_id, 'member'\)/i);
  assert.match(acceptanceEvidence,/revoke all on public\.whatsapp_booking_acceptance_checks from anon, authenticated/i);
  assert.match(acceptanceEvidence,/grant execute on function private\.record_whatsapp_booking_acceptance[\s\S]*to service_role/i);
  assert.match(acceptanceEvidence,/count\(\*\)=8 and bool_and\(status='passed'\)/i);
});

test("automated acceptance runner is privacy-safe, bounded and service-only",()=>{
  assert.match(acceptanceRunner,/private\.run_whatsapp_booking_acceptance\(p_organization_id uuid\)/i);
  assert.match(acceptanceRunner,/channel='whatsapp'[\s\S]*identity_verified_by_channel/i);
  assert.match(acceptanceRunner,/pg_catalog\.pg_get_constraintdef[\s\S]*tstzrange/i);
  assert.match(acceptanceRunner,/having count\(m\.id\)>1/i);
  assert.match(acceptanceRunner,/revoke all on function private\.run_whatsapp_booking_acceptance\(uuid\) from public,anon,authenticated/i);
  assert.doesNotMatch(acceptanceRunner,/customer_name|customer_phone|patient_name|notice_text/);
});

test("closure runner records honest aggregate evidence without sending messages",()=>{
  for(const key of ["reschedule_cancel","payments","reminders_commands_handoff","abandoned_recovery"]) assert.match(closureRunner,new RegExp(`'${key}'`));
  assert.match(closureRunner,/pay_at_clinic>0 and full_paid>0 and full_expired>0 and deposit_paid>0/i);
  assert.match(closureRunner,/reminder_count>0 and command_count>0 and handoff_count>0/i);
  assert.match(closureRunner,/revoke all on function private\.run_whatsapp_booking_acceptance_closure\(uuid\) from public,anon,authenticated/i);
  assert.doesNotMatch(closureRunner,/insert into public\.messages|net\.http_post|customer_name|customer_phone|patient_name/i);
});

test("controlled channel harness is hashed, expiring, bounded and dormant by default",()=>{
  assert.match(channelHarness,/recipient_hash bytea/i);
  assert.doesNotMatch(channelHarness,/recipient_phone|contact_address|patient_name/i);
  assert.match(channelHarness,/max_messages between 1 and 3/i);
  assert.match(channelHarness,/now\(\)\+interval '30 minutes'/i);
  assert.match(channelHarness,/message_count<max_messages/i);
  assert.match(channelHarness,/cancel_whatsapp_acceptance_tests/i);
  assert.match(channelHarness,/revoke all on function private\.claim_whatsapp_acceptance_test/i);
  assert.doesNotMatch(channelHarness,/insert into public\.messages|net\.http_post/i);
});

test("acceptance execution controller is leased, idempotent, audited and fail-closed",()=>{
  assert.match(executionController,/lease_token=gen_random_uuid\(\)/i);
  assert.match(executionController,/status='running' and lease_token=p_lease_token/i);
  assert.match(executionController,/message_count<=max_messages/i);
  assert.match(executionController,/started_at<now\(\)-interval '10 minutes'/i);
  assert.match(executionController,/whatsapp_acceptance_test_events/i);
  assert.match(executionController,/record_whatsapp_booking_acceptance/i);
  assert.match(executionController,/revoke all on function private\.complete_whatsapp_acceptance_test/i);
  assert.doesNotMatch(executionController,/insert into public\.messages|net\.http_post|recipient_phone|patient_name/i);
});

test("controlled acceptance binds a recent delivered record without storing another phone number",()=>{
  assert.match(verifiedRecipientBinding,/verified_message_id uuid references public\.messages/i);
  assert.match(verifiedRecipientBinding,/m\.status \? 'delivered'/i);
  assert.match(verifiedRecipientBinding,/m\.timestamp >= now\(\)-interval '30 days'/i);
  assert.match(verifiedRecipientBinding,/extensions\.digest\(regexp_replace\(verified_address/i);
  assert.match(verifiedRecipientBinding,/revoke all on function private\.arm_whatsapp_acceptance_test_from_delivery/i);
  assert.doesNotMatch(verifiedRecipientBinding,/recipient_phone|patient_name/i);
});

test("deposit acceptance closes only from an attached synthetic payment return",()=>{
  assert.match(depositReconciliation,/subject_payment_id uuid references public\.booking_payments/i);
  assert.match(depositReconciliation,/p\.payment_mode='deposit_online'/i);
  assert.match(depositReconciliation,/p\.metadata->>'synthetic_acceptance'='true'/i);
  assert.match(depositReconciliation,/new\.status not in \('paid','failed','expired'\)/i);
  assert.match(depositReconciliation,/private\.complete_whatsapp_acceptance_test/i);
  assert.match(depositReconciliation,/revoke all on function private\.attach_deposit_acceptance_payment/i);
  assert.doesNotMatch(depositReconciliation,/patient_name|customer_phone|recipient_phone/i);
});

test("deposit launcher is service-only, bounded and requires a verified delivery",()=>{
  assert.match(depositLauncher,/security invoker/i);
  assert.match(depositLauncher,/bound_message_id is null/i);
  assert.match(depositLauncher,/arm_whatsapp_acceptance_test_from_delivery[\s\S]*'deposit_payment'[\s\S]*1/i);
  assert.match(depositLauncher,/revoke all on function public\.prepare_deposit_acceptance_test\(uuid\) from public,anon,authenticated/i);
  assert.match(depositLauncher,/grant execute on function public\.prepare_deposit_acceptance_test\(uuid\) to service_role/i);
  assert.doesNotMatch(depositLauncher,/insert into public\.messages|recipient_phone|patient_name/i);
});

test("deposit dispatcher is dormant until checkout and payment evidence are attached",()=>{
  assert.match(depositDispatcher,/subject_payment_id is not null/i);
  assert.match(depositDispatcher,/checkout_url ~ '\^https:\/\/omnirelay-light/i);
  assert.match(depositDispatcher,/message_count<max_messages/i);
  assert.match(depositDispatcher,/security invoker/i);
  assert.match(depositDispatcher,/grant execute on function public\.claim_deposit_acceptance_dispatch\(uuid\) to service_role/i);
  assert.match(depositDispatchFunction,/token!==serviceKey/i);
  assert.match(depositDispatchFunction,/omnirelay_dispatch_key:key/i);
  assert.match(depositDispatchFunction,/event_type","payment_action/i);
  assert.match(depositDispatchFunction,/Synthetic Patient/);
  assert.doesNotMatch(depositDispatchFunction,/customer_name|patient_name|recipient_phone/i);
});

test("deposit dispatcher keeps internal evidence outside the Meta template payload",()=>{
  assert.doesNotMatch(depositDispatchFunction,/components:\[[\s\S]*?meta:\{/i);
  assert.match(depositDispatchFunction,/status:\{pending:[\s\S]*?acceptance_run_id:run\.id[\s\S]*?purpose:"deposit_acceptance"/i);
});

test("controlled deposit uses one opaque WhatsApp URL parameter",()=>{
  const depositPreparation=readFileSync(new URL("../app/api/readiness/deposit-test/route.ts",import.meta.url),"utf8");
  const opaqueCheckout=readFileSync(new URL("../app/pay/[token]/page.tsx",import.meta.url),"utf8");
  assert.match(depositPreparation,/checkoutUrl=`https:\/\/omnirelay-light[^`]+\/pay\/\$\{encodeURIComponent\(token\)\}`/i);
  assert.doesNotMatch(depositPreparation,/checkoutUrl=.*fixture=/i);
  assert.match(depositDispatchFunction,/buttonSuffix=checkout\.pathname\.split/i);
  assert.match(depositDispatchFunction,/at\(-2\)!=="pay"/i);
  assert.match(opaqueCheckout,/deposit-checkout\?token=/i);
  assert.doesNotMatch(opaqueCheckout,/location\.search|fixture=params/i);
});

test("₹1 acceptance payment is isolated from appointments and patient workflows",()=>{
  assert.match(isolatedFixture,/create table public\.whatsapp_acceptance_payments/i);
  assert.match(isolatedFixture,/check\(amount_paise=100\)/i);
  assert.match(isolatedFixture,/subject_acceptance_payment_id/i);
  assert.match(isolatedFixture,/reconcile_isolated_acceptance_payment/i);
  assert.match(isolatedFixture,/subject_payment_id is not null or subject_acceptance_payment_id is not null/i);
  assert.doesNotMatch(isolatedFixture,/insert into public\.appointments|patient_name|customer_phone|recipient_phone/i);
});

test("deposit acceptance preparation uses a registered bounded rate limit",()=>{
  assert.match(depositTestRoute,/deposit_acceptance_prepare[\s\S]*?3[\s\S]*?3600/i);
  assert.match(depositRateLimit,/'deposit_acceptance_prepare'/i);
});

test("deposit preparation reaches private controls only through the service role",()=>{
  assert.match(secureDepositPreparation,/prepare_deposit_acceptance_test\(uuid\) security definer/i);
  assert.match(secureDepositPreparation,/revoke all[\s\S]*?public, anon, authenticated/i);
  assert.match(secureDepositPreparation,/grant execute[\s\S]*?service_role/i);
});
