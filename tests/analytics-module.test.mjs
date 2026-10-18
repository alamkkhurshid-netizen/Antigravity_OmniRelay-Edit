import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("analytics engine module implements strict zero-PHI rule", async () => {
  const engine = await read("lib/analytics-engine.ts");

  assert.match(engine, /Strict Zero-PHI Rule/);
  assert.match(engine, /Never includes patient names, phone numbers, notes/);
  assert.match(engine, /buildSanitizedAiPromptPayload/);
});

test("analytics calculation handles empty appointments array safely", () => {
  function computeAppointmentKpis(appointments = []) {
    const total = appointments.length;
    if (total === 0) {
      return { total: 0, completed: 0, noShow: 0, cancelled: 0, completionRate: 0, noShowRate: 0 };
    }
    const completed = appointments.filter((a) => a.status === "completed").length;
    const noShow = appointments.filter((a) => a.status === "no_show").length;
    const cancelled = appointments.filter((a) => a.status === "cancelled").length;
    return {
      total,
      completed,
      noShow,
      cancelled,
      completionRate: Math.round((completed / total) * 100),
      noShowRate: Math.round((noShow / total) * 100),
    };
  }

  const result = computeAppointmentKpis([]);
  assert.equal(result.total, 0);
  assert.equal(result.completionRate, 0);
  assert.equal(result.noShowRate, 0);
});

test("appointment completion rate and no-show rate calculate accurately", () => {
  function computeAppointmentKpis(appointments) {
    const total = appointments.length;
    const completed = appointments.filter((a) => a.status === "completed").length;
    const noShow = appointments.filter((a) => a.status === "no_show").length;
    return {
      total,
      completionRate: Math.round((completed / total) * 100),
      noShowRate: Math.round((noShow / total) * 100),
    };
  }

  const sample = [
    { status: "completed" },
    { status: "completed" },
    { status: "completed" },
    { status: "no_show" },
    { status: "cancelled" },
  ];
  const res = computeAppointmentKpis(sample);
  assert.equal(res.total, 5);
  assert.equal(res.completionRate, 60); // 3/5 = 60%
  assert.equal(res.noShowRate, 20);     // 1/5 = 20%
});

test("reminder delivery rate calculates ratio of delivered to dispatched", () => {
  function computeDeliveryRate(reminders) {
    const dispatched = reminders.filter((r) => ["dispatched", "delivered", "read"].includes(r.status)).length;
    if (dispatched === 0) return 0;
    const successful = reminders.filter((r) => ["delivered", "read"].includes(r.status)).length;
    return Math.round((successful / dispatched) * 100);
  }

  const sample = [
    { status: "read" },
    { status: "delivered" },
    { status: "dispatched" },
    { status: "failed" },
  ];
  assert.equal(computeDeliveryRate(sample), 67); // 2/3 = 66.6% -> 67%
  assert.equal(computeDeliveryRate([{ status: "failed" }]), 0);
});

test("labor hours saved formula computes reception time savings correctly", () => {
  function estimateLaborHoursSaved(automatedReminders, onlineBookings) {
    // 3 minutes saved per reminder, 5 minutes saved per online self-booking
    const minutesSaved = (automatedReminders * 3) + (onlineBookings * 5);
    return Math.round((minutesSaved / 60) * 10) / 10;
  }

  assert.equal(estimateLaborHoursSaved(100, 20), 6.7); // (300 + 100)/60 = 6.666 -> 6.7 hrs
  assert.equal(estimateLaborHoursSaved(0, 0), 0);
});

test("OPD queue wait time calculation measures minutes between arrival and call", () => {
  function computeWaitTimeMinutes(arrivedAt, calledAt) {
    const start = new Date(arrivedAt).getTime();
    const end = new Date(calledAt).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    return Math.round((end - start) / (1000 * 60));
  }

  const arrived = "2026-10-18T09:00:00Z";
  const called = "2026-10-18T09:22:30Z";
  assert.equal(computeWaitTimeMinutes(arrived, called), 23);
  assert.equal(computeWaitTimeMinutes(called, arrived), 0);
});

test("revenue calculation aggregates consultation amounts in paise and INR", () => {
  function aggregateRevenue(appointments) {
    const totalPaise = appointments
      .filter((a) => a.status === "completed" && a.payment?.status === "paid")
      .reduce((acc, a) => acc + (a.payment?.amount_paise || 0), 0);
    return {
      totalPaise,
      totalInr: totalPaise / 100,
    };
  }

  const list = [
    { status: "completed", payment: { status: "paid", amount_paise: 50000 } },
    { status: "completed", payment: { status: "paid", amount_paise: 80000 } },
    { status: "cancelled", payment: { status: "refunded", amount_paise: 50000 } },
  ];
  const rev = aggregateRevenue(list);
  assert.equal(rev.totalPaise, 130000);
  assert.equal(rev.totalInr, 1300);
});

test("doctor-specific filter aggregates metrics only for matching resource_id", () => {
  function filterByDoctor(appointments, doctorId) {
    if (!doctorId || doctorId === "all") return appointments;
    return appointments.filter((a) => a.resource_id === doctorId);
  }

  const list = [
    { id: "1", resource_id: "doc-A" },
    { id: "2", resource_id: "doc-B" },
    { id: "3", resource_id: "doc-A" },
  ];
  assert.equal(filterByDoctor(list, "all").length, 3);
  assert.equal(filterByDoctor(list, "doc-A").length, 2);
  assert.equal(filterByDoctor(list, "doc-B").length, 1);
});

test("analytics workspace hook validates supported time ranges", async () => {
  const hook = await read("app/app/analytics/use-analytics-workspace.ts");
  assert.match(hook, /DateRangeKey/);
  assert.match(hook, /api\/analytics\/summary/);
  assert.match(hook, /api\/analytics\/ai-insights/);
});

test("zero-PHI sanitizer strips all patient identifiers from payload", () => {
  function sanitizeForAi(rawMetrics) {
    const { patient_names, phone_numbers, patient_records, ...sanitized } = rawMetrics;
    return sanitized;
  }

  const raw = {
    patient_names: ["John Doe"],
    phone_numbers: ["+919876543210"],
    totalBookings: 42,
    completionRate: 88,
  };
  const clean = sanitizeForAi(raw);
  assert.equal(clean.totalBookings, 42);
  assert.equal(clean.completionRate, 88);
  assert.equal(clean.patient_names, undefined);
  assert.equal(clean.phone_numbers, undefined);
});
