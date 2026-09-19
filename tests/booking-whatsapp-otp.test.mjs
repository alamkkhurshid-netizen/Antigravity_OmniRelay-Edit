import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration=await readFile(new URL("../supabase/migrations/20260811131455_booking_whatsapp_otp_foundation.sql",import.meta.url),"utf8");
const requestRoute=await readFile(new URL("../app/api/public-booking/otp/request/route.ts",import.meta.url),"utf8");
const bookingUi=await readFile(new URL("../app/book/[slug]/booking-concierge.tsx",import.meta.url),"utf8");

test("OTP challenges are private, short-lived and attempt limited",()=>{
  assert.match(migration,/create table private\.booking_phone_otp_challenges/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/attempt_count>=5/);
  assert.match(migration,/interval '5 minutes'/);
  assert.match(migration,/created_at>now\(\)-interval '60 seconds'/);
  assert.match(migration,/recent_count>=3/);
  assert.match(migration,/code_hash bytea/);
  assert.match(migration,/verification_token_hash bytea/);
});

test("OTP RPCs are restricted to the service role",()=>{
  assert.match(migration,/revoke all on function public\.create_booking_phone_otp_challenge[\s\S]*from public,anon,authenticated/);
  assert.match(migration,/grant execute on function public\.create_booking_phone_otp_challenge[\s\S]*to service_role/);
  assert.ok(migration.includes("coalesce((select auth.jwt()->>'role'),'') <> 'service_role'"));
});

test("plaintext OTP is not returned to the browser and is redacted after dispatch",()=>{
  assert.doesNotMatch(requestRoute,/NextResponse\.json\(\{[^}]*otp_code/);
  assert.match(requestRoute,/challenge\.otp_code/);
  assert.match(migration,/redact_dispatched_booking_otp/);
  assert.match(migration,/jsonb_set\(new\.content,'\{data,components\}','\[\]'::jsonb/);
});

test("booking UI verifies before booking and consumes the proof afterward",()=>{
  assert.match(bookingUi,/otpAvailable&&\(!otpVerificationToken\|\|otpVerifiedPhone!==contactDigits\)/);
  assert.match(bookingUi,/await attachIdentity[\s\S]*await consumeOtp/);
  assert.match(bookingUi,/event\.target\.value\.replace\(\/\\D\/g,""\)\.slice\(0,6\)/);
});
