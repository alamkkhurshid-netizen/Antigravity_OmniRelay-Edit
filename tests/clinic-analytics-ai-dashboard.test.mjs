import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("Clinic Analytics Engine: Canonical Metrics & Deterministic Aggregation", async (t) => {
  const analyticsEngine = await import(
    `file://${path.join(projectRoot, "lib", "analytics-engine.ts")}`
  );

  const mockNow = new Date("2026-09-18T20:00:00+05:30");

  const mockAppointments = [
    {
      id: "app-1",
      patient_id: "pat-1",
      resource_id: "doc-1",
      starts_at: "2026-09-18T10:00:00+05:30",
      status: "completed",
      payment: { amount_paise: 80000, payment_mode: "pay_at_clinic", status: "paid" },
    },
    {
      id: "app-2",
      patient_id: "pat-2",
      resource_id: "doc-1",
      starts_at: "2026-09-18T10:30:00+05:30",
      status: "completed",
      payment: { amount_paise: 50000, payment_mode: "full_online", status: "paid" },
    },
    {
      id: "app-3",
      patient_id: "pat-3",
      resource_id: "doc-2",
      starts_at: "2026-09-18T11:00:00+05:30",
      status: "no_show",
      payment: { amount_paise: 60000, payment_mode: "pay_at_clinic", status: "pending" },
    },
    {
      id: "app-4",
      patient_id: "pat-4",
      resource_id: "doc-2",
      starts_at: "2026-09-18T11:30:00+05:30",
      status: "cancelled",
      payment: { amount_paise: 60000, payment_mode: "pay_at_clinic", status: "pending" },
    },
    {
      id: "app-5",
      patient_id: "pat-5",
      resource_id: "doc-1",
      starts_at: "2026-09-18T12:00:00+05:30",
      status: "arrived",
      payment: { amount_paise: 80000, payment_mode: "pay_at_clinic", status: "pending" },
    },
  ];

  const mockQueue = [
    {
      appointment_id: "app-1",
      token_number: 1,
      queue_status: "completed",
      arrived_at: "2026-09-18T09:55:00+05:30",
      called_at: "2026-09-18T10:15:00+05:30", // 15 mins wait
    },
    {
      appointment_id: "app-2",
      token_number: 2,
      queue_status: "completed",
      arrived_at: "2026-09-18T10:20:00+05:30",
      called_at: "2026-09-18T10:55:00+05:30", // 25 mins wait (long wait > 20 mins)
    },
  ];

  const mockReminders = [
    { id: "rem-1", appointment_id: "app-1", status: "read" },
    { id: "rem-2", appointment_id: "app-2", status: "delivered" },
    { id: "rem-3", appointment_id: "app-3", status: "delivered" },
    { id: "rem-4", appointment_id: "app-4", status: "failed" },
  ];

  const mockTasks = [
    { id: "task-1", appointment_id: "app-1", status: "completed", due_at: "2026-09-18T18:00:00+05:30" },
    { id: "task-2", appointment_id: "app-2", status: "open", due_at: "2026-09-17T18:00:00+05:30" }, // Overdue
  ];

  const mockResources = [
    { id: "doc-1", name: "Dr. A. Sen" },
    { id: "doc-2", name: "Dr. K. Patel" },
  ];

  await t.test("funnel and conversion rates match canonical definitions", () => {
    const res = analyticsEngine.calculateClinicAnalytics({
      appointments: mockAppointments,
      queueEntries: mockQueue,
      reminders: mockReminders,
      careTasks: mockTasks,
      resources: mockResources,
      range: "today",
      now: mockNow,
    });

    assert.equal(res.funnel.booked, 5);
    // confirmed = completed (2) + no_show (1) + arrived (1) = 4
    assert.equal(res.funnel.confirmed, 4);
    assert.equal(res.funnel.completed, 2);
    assert.equal(res.funnel.noShow, 1);
    assert.equal(res.funnel.cancelled, 1);

    // completion rate: 2 / 5 = 40%
    assert.equal(res.funnel.completionRate, 40);
    // no-show rate: 1 / 4 = 25%
    assert.equal(res.funnel.noShowRate, 25);
    // cancellation rate: 1 / 5 = 20%
    assert.equal(res.funnel.cancellationRate, 20);
  });

  await t.test("queue delay benchmarks calculate accurately", () => {
    const res = analyticsEngine.calculateClinicAnalytics({
      appointments: mockAppointments,
      queueEntries: mockQueue,
      reminders: mockReminders,
      careTasks: mockTasks,
      resources: mockResources,
      range: "today",
      now: mockNow,
    });

    assert.equal(res.queueDelays.totalServed, 2);
    // (15 + 25) / 2 = 20 mins
    assert.equal(res.queueDelays.avgWaitTimeMinutes, 20);
    assert.equal(res.queueDelays.maxWaitTimeMinutes, 25);
    assert.equal(res.queueDelays.longWaitCount, 1);
  });

  await t.test("automation staff hours saved calculated at 4 mins per reminder", () => {
    const res = analyticsEngine.calculateClinicAnalytics({
      appointments: mockAppointments,
      queueEntries: mockQueue,
      reminders: mockReminders,
      careTasks: mockTasks,
      resources: mockResources,
      range: "today",
      now: mockNow,
    });

    assert.equal(res.automation.totalRemindersDispatched, 4);
    assert.equal(res.automation.deliveredCount, 3); // rem-1 (read), rem-2 (delivered), rem-3 (delivered)
    assert.equal(res.automation.readCount, 1);
    assert.equal(res.automation.failedCount, 1);
    // 3 delivered * 4 mins = 12 mins = 0.2 hours
    assert.equal(res.automation.staffHoursSaved, 0.2);
  });

  await t.test("doctor-wise breakdown isolates individual performance and revenue", () => {
    const res = analyticsEngine.calculateClinicAnalytics({
      appointments: mockAppointments,
      queueEntries: mockQueue,
      reminders: mockReminders,
      careTasks: mockTasks,
      resources: mockResources,
      range: "today",
      now: mockNow,
    });

    assert.equal(res.doctorSummaries.length, 2);
    const doc1 = res.doctorSummaries.find((d) => d.resourceId === "doc-1");
    assert.ok(doc1);
    assert.equal(doc1.doctorName, "Dr. A. Sen");
    assert.equal(doc1.totalBookings, 3);
    assert.equal(doc1.completedCount, 2);
    assert.equal(doc1.estimatedRevenuePaise, 210000); // 80000 + 50000 + 80000

    const doc2 = res.doctorSummaries.find((d) => d.resourceId === "doc-2");
    assert.ok(doc2);
    assert.equal(doc2.noShowCount, 1);
    assert.equal(doc2.cancelledCount, 1);
    assert.equal(doc2.estimatedRevenuePaise, 60000); // app-3 (no-show still counted in pending revenue, app-4 cancelled excluded)
  });

  await t.test("generateAnalyticsCsv produces compliant CSV with UTF-8 BOM", () => {
    const res = analyticsEngine.calculateClinicAnalytics({
      appointments: mockAppointments,
      queueEntries: mockQueue,
      reminders: mockReminders,
      careTasks: mockTasks,
      resources: mockResources,
      range: "today",
      now: mockNow,
    });

    const csv = analyticsEngine.generateAnalyticsCsv(res, "Sunrise Heart Clinic");
    assert.ok(csv.startsWith("\uFEFF"), "Must start with UTF-8 BOM for Excel");
    assert.match(csv, /Sunrise Heart Clinic/);
    assert.match(csv, /SECTION 1: APPOINTMENT FUNNEL & CONVERSION RATES/);
    assert.match(csv, /SECTION 2: DOCTOR-WISE LOAD & EFFICIENCY/);
    assert.match(csv, /Dr\. A\. Sen/);
    assert.match(csv, /SECTION 3: WHATSAPP AUTOMATION & STAFF SAVINGS/);
  });

  await t.test("buildSanitizedAiPromptPayload enforces strict Zero-PHI", () => {
    const res = analyticsEngine.calculateClinicAnalytics({
      appointments: mockAppointments,
      queueEntries: mockQueue,
      reminders: mockReminders,
      careTasks: mockTasks,
      resources: mockResources,
      range: "today",
      now: mockNow,
    });

    const aiPayload = analyticsEngine.buildSanitizedAiPromptPayload(res, "Sunrise Heart Clinic");
    const serialized = JSON.stringify(aiPayload);

    // Verify zero patient names, phones, or clinical text in payload
    assert.doesNotMatch(serialized, /pat-\d/);
    assert.doesNotMatch(serialized, /phone/i);
    assert.doesNotMatch(serialized, /diagnosis/i);
    assert.doesNotMatch(serialized, /prescription/i);
    assert.ok(aiPayload.funnel);
    assert.ok(aiPayload.doctorLoads);
  });
});

test("Clinic Analytics API Routes: Zero-PHI & Security Boundaries", async () => {
  const summaryRoute = fs.readFileSync(
    path.join(projectRoot, "app", "api", "analytics", "summary", "route.ts"),
    "utf-8"
  );
  assert.ok(summaryRoute.includes("getWorkspace"), "Summary route must enforce workspace auth");
  assert.ok(summaryRoute.includes("organization_id"), "Summary route must filter by tenant organization");
  assert.ok(summaryRoute.includes('format === "csv"'), "Summary route must support CSV export");

  const aiRoute = fs.readFileSync(
    path.join(projectRoot, "app", "api", "analytics", "ai-insights", "route.ts"),
    "utf-8"
  );
  assert.ok(aiRoute.includes("getWorkspace"), "AI route must enforce workspace auth");
  assert.ok(aiRoute.includes("forbiddenKeys"), "AI route must validate Zero-PHI boundary");
  assert.ok(aiRoute.includes("GEMINI_API_KEY"), "AI route must support Gemini 2.5 Flash");
  assert.ok(aiRoute.includes("rule_engine"), "AI route must provide deterministic fallback");
});

test("Clinic Analytics UI & Navigation Integration", async () => {
  const appShell = fs.readFileSync(
    path.join(projectRoot, "components", "app-shell.tsx"),
    "utf-8"
  );
  assert.ok(
    appShell.includes('["Analytics & Insights", "/app/analytics"'),
    "AppShell nav must link to /app/analytics"
  );

  const overviewPage = fs.readFileSync(
    path.join(projectRoot, "app", "app", "page.tsx"),
    "utf-8"
  );
  assert.ok(
    overviewPage.includes("/app/analytics"),
    "Overview page must link to Analytics workspace"
  );

  const workspaceUi = fs.readFileSync(
    path.join(projectRoot, "app", "app", "analytics", "analytics-workspace.tsx"),
    "utf-8"
  );
  assert.ok(
    workspaceUi.includes("AI Operations Copilot"),
    "UI must render AI Operations Copilot"
  );
  assert.ok(
    workspaceUi.includes("1. What Happened?"),
    "UI must answer What Happened?"
  );
  assert.ok(
    workspaceUi.includes("2. Why It Matters"),
    "UI must answer Why It Matters"
  );
  assert.ok(
    workspaceUi.includes("3. Prescribed Staff Actions"),
    "UI must answer Whose Action Is Needed?"
  );
});
