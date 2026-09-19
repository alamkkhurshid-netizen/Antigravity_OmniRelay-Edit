import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildDailyRosterData,
  generateDailyRosterCsv,
  generateRosterEmailHtml,
} from "../lib/daily-roster.ts";

const root = new URL("../", import.meta.url);

test("buildDailyRosterData aggregates doctor KPIs and patient appointments correctly", () => {
  const mockAppointments = [
    {
      id: "app-1",
      customer_name: "Rahul Sharma",
      customer_phone: "+919876543210",
      starts_at: "2026-09-19T10:00:00+05:30",
      status: "confirmed",
      resource_id: "doc-1",
      location_id: "loc-1",
      resource: { name: "Dr. A. Sen" },
      location: { name: "Chamber 1" },
      service: { name: "Cardiology Consultation", duration_minutes: 30 },
      payment: { payment_mode: "pay_at_clinic", amount_paise: 80000, status: "pending" },
    },
    {
      id: "app-2",
      customer_name: "Priya Mukherjee",
      customer_phone: "+919876543211",
      starts_at: "2026-09-19T10:30:00+05:30",
      status: "arrived",
      resource_id: "doc-1",
      location_id: "loc-1",
      resource: { name: "Dr. A. Sen" },
      location: { name: "Chamber 1" },
      service: { name: "Follow-up", duration_minutes: 15 },
      payment: { payment_mode: "full_online", amount_paise: 50000, status: "paid" },
    },
    {
      id: "app-3",
      customer_name: "Amit Roy",
      customer_phone: "+919876543212",
      starts_at: "2026-09-19T11:00:00+05:30",
      status: "cancelled",
      resource_id: "doc-2",
      location_id: "loc-2",
      resource: { name: "Dr. K. Patel" },
      location: { name: "Chamber 2" },
      service: { name: "Orthopedic Review", duration_minutes: 30 },
      payment: { payment_mode: "pay_at_clinic", amount_paise: 100000, status: "pending" },
    },
  ];

  const mockResources = [
    {
      id: "doc-1",
      name: "Dr. A. Sen",
      location_id: "loc-1",
      provider_profiles: { contact_email: "sen@clinic.com", contact_phone: "+919876543201" },
    },
    {
      id: "doc-2",
      name: "Dr. K. Patel",
      location_id: "loc-2",
      provider_profiles: { contact_email: "patel@clinic.com", contact_phone: "+919876543202" },
    },
  ];

  const mockLocations = [
    { id: "loc-1", name: "Chamber 1" },
    { id: "loc-2", name: "Chamber 2" },
  ];

  const mockQueue = [
    { appointment_id: "app-1", token_number: 1, queue_status: "waiting" },
    { appointment_id: "app-2", token_number: 2, queue_status: "arrived" },
  ];

  const roster = buildDailyRosterData({
    organizationName: "Kolkata Heart Clinic",
    date: "2026-09-19",
    appointments: mockAppointments,
    resources: mockResources,
    locations: mockLocations,
    queueEntries: mockQueue,
  });

  assert.equal(roster.totalAppointments, 3);
  assert.equal(roster.doctorSummaries.length, 2);

  const doc1 = roster.doctorSummaries.find((d) => d.resourceId === "doc-1");
  assert.ok(doc1);
  assert.equal(doc1.doctorName, "Dr. A. Sen");
  assert.equal(doc1.totalBookings, 2);
  assert.equal(doc1.confirmedCount, 1);
  assert.equal(doc1.arrivedCount, 1);
  assert.equal(doc1.estimatedRevenuePaise, 130000); // 80000 + 50000

  const doc2 = roster.doctorSummaries.find((d) => d.resourceId === "doc-2");
  assert.ok(doc2);
  assert.equal(doc2.cancelledCount, 1);
  assert.equal(doc2.estimatedRevenuePaise, 0); // cancelled does not count as revenue
});

test("generateDailyRosterCsv outputs compliant CSV with UTF-8 BOM and two clear sections", () => {
  const roster = {
    organizationName: "City Polyclinic",
    date: "2026-09-19",
    generatedAt: "2026-09-19T20:00:00+05:30",
    totalAppointments: 1,
    doctorSummaries: [
      {
        resourceId: "doc-1",
        doctorName: "Dr. A. Sen",
        chamberName: "Chamber A",
        totalBookings: 1,
        confirmedCount: 1,
        arrivedCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        pendingCount: 0,
        estimatedRevenuePaise: 50000,
      },
    ],
    appointments: [
      {
        id: "app-1",
        customer_name: "John Doe, Jr.",
        customer_phone: "+919876543210",
        customer_email: "john@example.com",
        starts_at: "2026-09-19T10:00:00+05:30",
        status: "confirmed",
        resource_id: "doc-1",
        location_id: "loc-1",
        resource_name: "Dr. A. Sen",
        location_name: "Chamber A",
        service_name: "Checkup",
        payment_mode: "pay_at_clinic",
        payment_status: "pending",
        token_number: 1,
      },
    ],
  };

  const csv = generateDailyRosterCsv(roster);

  // Must begin with UTF-8 BOM for Excel
  assert.ok(csv.startsWith("\uFEFF"));

  // Contains Title & Metadata
  assert.match(csv, /OMNIRELAY — CLINIC DAILY PATIENT BOOKING STORY/);
  assert.match(csv, /City Polyclinic/);
  assert.match(csv, /2026-09-19/);

  // Section 1: Doctor-wise Booking Summary
  assert.match(csv, /SECTION 1: DOCTOR-WISE BOOKING SUMMARY/);
  assert.match(csv, /Dr\. A\. Sen/);
  assert.match(csv, /TOTAL CLINIC LOAD/);

  // Section 2: Chronological Patient Run-Sheet
  assert.match(csv, /SECTION 2: CHRONOLOGICAL PATIENT RUN-SHEET/);
  assert.match(csv, /"John Doe, Jr\."/); // Properly escaped comma in name
  assert.match(csv, /#1/); // Token number
});

test("generateRosterEmailHtml enforces privacy by filtering doctor-specific schedules", () => {
  const roster = {
    organizationName: "Specialty Clinic",
    date: "2026-09-19",
    generatedAt: "2026-09-19T20:00:00+05:30",
    totalAppointments: 2,
    doctorSummaries: [
      {
        resourceId: "doc-1",
        doctorName: "Dr. Sen",
        chamberName: "Room 101",
        totalBookings: 1,
        confirmedCount: 1,
        arrivedCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        pendingCount: 0,
        estimatedRevenuePaise: 50000,
      },
      {
        resourceId: "doc-2",
        doctorName: "Dr. Roy",
        chamberName: "Room 102",
        totalBookings: 1,
        confirmedCount: 1,
        arrivedCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        pendingCount: 0,
        estimatedRevenuePaise: 60000,
      },
    ],
    appointments: [
      {
        id: "app-1",
        customer_name: "Patient A (Sen)",
        starts_at: "2026-09-19T10:00:00+05:30",
        status: "confirmed",
        resource_id: "doc-1",
        location_id: "loc-1",
        resource_name: "Dr. Sen",
      },
      {
        id: "app-2",
        customer_name: "Patient B (Roy)",
        starts_at: "2026-09-19T10:30:00+05:30",
        status: "confirmed",
        resource_id: "doc-2",
        location_id: "loc-2",
        resource_name: "Dr. Roy",
      },
    ],
  };

  // Clinic Master Email includes both patients and summary
  const clinicEmail = generateRosterEmailHtml(roster);
  assert.match(clinicEmail.html, /Doctor-wise Booking Summary/);
  assert.match(clinicEmail.html, /Patient A \(Sen\)/);
  assert.match(clinicEmail.html, /Patient B \(Roy\)/);

  // Doctor 1's Email ONLY includes Doctor 1's patients (not Doctor 2)
  const doctor1Email = generateRosterEmailHtml(roster, "doc-1");
  assert.match(doctor1Email.subject, /Dr\. Sen/);
  assert.match(doctor1Email.html, /Patient A \(Sen\)/);
  assert.doesNotMatch(doctor1Email.html, /Patient B \(Roy\)/);
  assert.doesNotMatch(doctor1Email.html, /Doctor-wise Booking Summary/); // Doctor doesn't need other doctors' KPI table
});

test("reception board exposes daily booking sheet download and email dispatch controls", async () => {
  const ui = await readFile(new URL("app/app/appointments/reception-board.tsx", root), "utf8");
  assert.match(ui, /downloadRoster/);
  assert.match(ui, /Download Sheet \(CSV\)/);
  assert.match(ui, /triggerEmailDispatch/);
  assert.match(ui, /Dispatch Email/);
  assert.match(ui, /\/api\/clinic-operations\/roster\/export/);
  assert.match(ui, /\/api\/clinic-operations\/roster\/dispatch/);
});

test("settings form supports configurable automated daily roster dispatch", async () => {
  const ui = await readFile(new URL("app/app/settings/workspace-form.tsx", root), "utf8");
  assert.match(ui, /roster_dispatch/);
  assert.match(ui, /Daily Patient Booking Roster & Email Dispatch/);
  assert.match(ui, /Enable automated daily booking email dispatch/);
  assert.match(ui, /Preferred dispatch time \(IST\)/);
  assert.match(ui, /Send master summary & attached spreadsheet to Clinic Email/);
  assert.match(ui, /Send doctor-specific personal schedules to each doctor(&apos;|')s registered email/);
  assert.match(ui, /Send Test Dispatch Now/);
});

test("export and cron routes enforce security boundaries", async () => {
  const exportRoute = await readFile(new URL("app/api/clinic-operations/roster/export/route.ts", root), "utf8");
  assert.match(exportRoute, /getWorkspace\(\)/);
  assert.match(exportRoute, /organization\.id/);
  assert.match(exportRoute, /text\/csv/);

  const cronRoute = await readFile(new URL("app/api/cron/roster-dispatch/route.ts", root), "utf8");
  assert.match(cronRoute, /CRON_SECRET/);
  assert.match(cronRoute, /createAdminClient/);
});
