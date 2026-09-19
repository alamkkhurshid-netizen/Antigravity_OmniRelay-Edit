import assert from "node:assert/strict";
import test from "node:test";
import {shouldSuppressAppointmentLifecycle} from "../supabase/functions/appointment-reminder-dispatch/policy.mjs";
import {readFileSync} from "node:fs";

const dispatcher=readFileSync(new URL("../supabase/functions/appointment-reminder-dispatch/index.ts",import.meta.url),"utf8");

const now=Date.parse("2026-08-03T10:00:00.000Z");
test("suppresses stale booking confirmations and reminders",()=>{
  assert.equal(shouldSuppressAppointmentLifecycle("confirmation","2026-08-03T09:00:00.000Z",now),true);
  assert.equal(shouldSuppressAppointmentLifecycle("reminder_2h","2026-08-03T09:00:00.000Z",now),true);
});
test("keeps future lifecycle events and intentional follow-ups",()=>{
  assert.equal(shouldSuppressAppointmentLifecycle("reminder_24h","2026-08-04T09:00:00.000Z",now),false);
  assert.equal(shouldSuppressAppointmentLifecycle("follow_up","2026-07-20T09:00:00.000Z",now),false);
  assert.equal(shouldSuppressAppointmentLifecycle("cancellation","2026-07-20T09:00:00.000Z",now),false);
});

test("booking confirmation matches the approved eight-variable Meta contract",()=>{
  assert.match(dispatcher,/function appointmentReference\(appointmentId: string\)/);
  assert.match(dispatcher,/const reference = appointmentReference\(appointment\.id\)/);
  assert.match(dispatcher,/confirmation: \[appointment\.customer_name, doctor, appointment\.organization\.name, service, date, time, location, reference\]/);
  assert.match(dispatcher,/resource:booking_resources\(name\)/);
  assert.match(dispatcher,/service:organization_services\(name\)/);
  assert.match(dispatcher,/hour12: true/);
});

test("appointment reminders match the approved seven-variable Meta contract",()=>{
  assert.match(dispatcher,/reminder_24h: \[appointment\.customer_name, doctor, date, time, location, reference, "15"\]/);
  assert.match(dispatcher,/cancellation: \[appointment\.customer_name, doctor, date, time, reference\]/);
  assert.match(dispatcher,/reschedule: \[appointment\.customer_name, doctor, time, date, location, reference\]/);
  assert.match(dispatcher,/follow_up: \[appointment\.customer_name, doctor, date, followUpDue\]/);
  assert.match(dispatcher,/reminder_2h: \[appointment\.customer_name, doctor, date, time, location, reference, "15"\]/);
});
