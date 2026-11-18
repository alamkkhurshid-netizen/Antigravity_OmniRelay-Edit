import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingMenu,
  choiceList,
  isRepeatableAppointment,
  matchDateChoice,
  matchDepartmentChoice,
  matchDoctorChoice,
  nextSevenDates,
  nextWorkingDates,
  replyButtons,
} from "../supabase/functions/whatsapp-booking-concierge/policy.mjs";

test("personalizes the returning-patient menu without exposing medical data", () => {
  const menu = bookingMenu("Welcome", "Raja");
  assert.match(menu, /Welcome back, Raja/);
  assert.match(menu, /Repeat my last appointment/);
  assert.match(menu, /Doctor directory & brochure/);
  assert.match(menu, /Clinic timings & location/);
  assert.match(menu, /Speak to front desk/);
  assert.doesNotMatch(menu, /Quick booking/);
  assert.doesNotMatch(menu, /disease|prescription content|diagnosis/i);
});

test("welcome menu incorporates clinic business name cleanly", () => {
  const menuNew = bookingMenu("Welcome. I can help with your clinic visit.", "", "Neoclinic");
  assert.match(menuNew, /Welcome to Neoclinic/);

  const menuReturning = bookingMenu("Welcome", "Alam", "Neoclinic");
  assert.match(menuReturning, /Welcome back to Neoclinic, Alam/);
});

test("nextWorkingDates only returns days matching doctor availability rules", () => {
  // Doctor works Monday(1), Wednesday(3), Friday(5)
  // Let's test from Wednesday 2026-11-18
  const base = new Date("2026-11-18T12:00:00Z");
  const dates = nextWorkingDates([1, 3, 5], 5, "Asia/Kolkata", base);
  assert.equal(dates.length, 5);
  // Starting tomorrow: Thu 19 (skip), Fri 20 (add), Sat 21 (skip), Sun 22 (skip), Mon 23 (add), Tue 24 (skip), Wed 25 (add)
  assert.deepEqual(dates.slice(0, 3), ["2026-11-20", "2026-11-23", "2026-11-25"]);
  for (const d of dates) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    assert.ok([1, 3, 5].includes(day), `Date ${d} is day ${day}, should be 1, 3, or 5`);
  }
});

test("matchDateChoice handles numeric indices and WhatsApp interactive text replies", () => {
  const dates = ["2026-11-20", "2026-11-23", "2026-11-25"];
  assert.equal(matchDateChoice("1", dates), "2026-11-20");
  assert.equal(matchDateChoice("3", dates), "2026-11-25");
  assert.equal(matchDateChoice("Wed 25 November, 2026", dates), "2026-11-25");
  assert.equal(matchDateChoice("25 Nov", dates), "2026-11-25");
  assert.equal(matchDateChoice("2026-11-23", dates), "2026-11-23");
  assert.equal(matchDateChoice("99", dates), null);
});

test("matchDepartmentChoice and matchDoctorChoice match numbers or names", () => {
  const depts = [{ id: "d1", name: "Pediatrics" }, { id: "d2", name: "Cardiology" }];
  assert.equal(matchDepartmentChoice("1", depts)?.name, "Pediatrics");
  assert.equal(matchDepartmentChoice("cardiology", depts)?.name, "Cardiology");
  assert.equal(matchDepartmentChoice("pedia", depts)?.name, "Pediatrics");

  const docs = [{ id: "r1", name: "Dr Ananya Bose" }, { id: "r2", name: "Dr Rohan Mukherjee" }];
  assert.equal(matchDoctorChoice("1", docs)?.name, "Dr Ananya Bose");
  assert.equal(matchDoctorChoice("Dr Ananya Bose", docs)?.name, "Dr Ananya Bose");
  assert.equal(matchDoctorChoice("Ananya", docs)?.name, "Dr Ananya Bose");
});

test("new patients do not see a misleading repeat option", () => {
  assert.doesNotMatch(bookingMenu("Welcome"), /Repeat my last appointment/);
  assert.match(bookingMenu("Welcome"), /Doctor directory & brochure/);
});
test("only complete previous appointments can be repeated", () => {
  assert.equal(isRepeatableAppointment({ service: { id: "s" }, location: { id: "l" }, resource: { id: "r" } }), true);
  assert.equal(isRepeatableAppointment({ service: { id: "s" }, location: null, resource: { id: "r" } }), false);
});
test("offers seven future dates", () => {
  assert.deepEqual(nextSevenDates(Date.parse("2026-08-03T00:00:00Z")), ["2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10"]);
});
test("reply buttons stay within Meta limits and preserve numeric state ids", () => {
  const message = replyButtons("Confirm booking?", [{ id: "1", title: "Confirm" }, { id: "2", title: "Cancel" }]);
  assert.equal(message.type, "button");
  assert.deepEqual(message.action.buttons.map((button) => button.reply.id), ["1", "2"]);
  assert.equal(replyButtons("Too many", [1, 2, 3, 4].map((id) => ({ id: String(id), title: String(id) }))), null);
});
test("choice lists support up to ten options and fall back above the limit", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1), title: `Option ${index + 1}` }));
  assert.equal(choiceList("Choose", "Open menu", rows).action.sections[0].rows.length, 10);
  assert.equal(choiceList("Choose", "Open menu", [...rows, { id: "11", title: "Option 11" }]), null);
});
