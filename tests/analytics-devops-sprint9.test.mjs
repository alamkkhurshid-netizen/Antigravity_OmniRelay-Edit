/**
 * OmniRelay Sprint 9 Automated Test Suite
 * Validates Analytics, DevOps, CI/CD, Feature Flags, and Production Readiness
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  calculateClinicAnalytics,
} from "../lib/analytics-engine.ts";

import {
  buildMonthlyReportMetrics,
  generateMonthlyReportHtml,
  generateMonthlyEmailSummary,
} from "../lib/reports/monthly-summary.ts";

import {
  generateStructuredAiInsights,
} from "../lib/analytics/ai-insights.ts";

import {
  isFeatureEnabled,
  getAllFeatureFlags,
  setFeatureFlagOverride,
  clearFeatureFlagOverrides,
} from "../lib/feature-flags.ts";

import {
  runSystemHealthChecks,
} from "../lib/monitoring/health-checks.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. S9-01: Event Taxonomy & Schema Invariants
// ==========================================
test("S9-01: Event taxonomy documentation defines all six event categories", () => {
  const eventsDocPath = path.resolve(__dirname, "../docs/ANALYTICS_EVENTS.md");
  assert.ok(fs.existsSync(eventsDocPath), "docs/ANALYTICS_EVENTS.md must exist");

  const content = fs.readFileSync(eventsDocPath, "utf-8");
  assert.ok(content.includes("appointment.completed"), "Must define appointment events");
  assert.ok(content.includes("queue.patient_called"), "Must define queue events");
  assert.ok(content.includes("whatsapp.message_delivered"), "Must define WhatsApp events");
  assert.ok(content.includes("billing.charge_captured"), "Must define billing events");
  assert.ok(content.includes("retail.order_placed"), "Must define retail events");
  assert.ok(content.includes("voice.call_completed"), "Must define voice events");
  assert.ok(content.includes("Zero-PHI"), "Must document Zero-PHI constraints");
});

// ==========================================
// 2. S9-02: Clinic Analytics Engine & KPI Calculations
// ==========================================
test("S9-02: Clinic analytics calculates doctor utilization and follow-up revenue", () => {
  const now = new Date("2026-10-18T18:00:00Z");
  const result = calculateClinicAnalytics({
    appointments: [
      {
        id: "app-1",
        resource_id: "doc-1",
        starts_at: "2026-10-18T10:00:00Z",
        status: "completed",
        service_id: "general_consultation",
        payment: { amount_paise: 50000, status: "paid", payment_mode: "full_online" },
      },
      {
        id: "app-2",
        resource_id: "doc-1",
        starts_at: "2026-10-18T11:00:00Z",
        status: "completed",
        service_id: "cardio_follow_up",
        payment: { amount_paise: 30000, status: "paid", payment_mode: "cash_clinic" },
      },
      {
        id: "app-3",
        resource_id: "doc-1",
        starts_at: "2026-10-18T14:00:00Z",
        status: "no_show",
        service_id: "general_consultation",
        payment: { amount_paise: 50000, status: "unpaid" },
      },
    ],
    queueEntries: [
      { appointment_id: "app-1", arrived_at: "2026-10-18T09:50:00Z", called_at: "2026-10-18T10:05:00Z" },
    ],
    reminders: [
      { id: "rem-1", appointment_id: "app-1", status: "delivered" },
      { id: "rem-2", appointment_id: "app-2", status: "read" },
    ],
    careTasks: [],
    resources: [{ id: "doc-1", name: "Dr. Sarah Jenkins" }],
    range: "today",
    now,
  });

  assert.equal(result.funnel.booked, 3);
  assert.equal(result.funnel.completed, 2);
  assert.equal(result.funnel.noShow, 1);
  assert.ok(typeof result.doctorUtilizationRate === "number");
  assert.ok(result.doctorUtilizationRate > 0, "Doctor utilization rate must be calculated");
  assert.equal(result.financialAndCare.totalRevenuePaise, 130000);
  assert.equal(result.financialAndCare.followUpRevenuePaise, 30000);
});

// ==========================================
// 3. S9-04: Monthly Executive Report Generator
// ==========================================
test("S9-04: Monthly report generator produces valid metrics and HTML markup", () => {
  const metrics = buildMonthlyReportMetrics({
    organizationId: "org-test-01",
    organizationName: "Metro Health Clinic",
    month: "October 2026",
    booked: 120,
    completed: 98,
    noShow: 12,
    cancelled: 10,
    remindersDispatched: 110,
    remindersDelivered: 106,
    remindersRead: 92,
    avgWaitMinutes: 14,
    grossRevenuePaise: 4900000,
    onlineRevenuePaise: 2100000,
    doctorUtilizationRate: 85,
  });

  assert.equal(metrics.funnel.booked, 120);
  assert.equal(metrics.funnel.completed, 98);
  assert.equal(metrics.funnel.completionRate, 82);
  assert.equal(metrics.funnel.noShowRate, 11);
  assert.ok(metrics.automation.staffHoursSaved > 0);

  const html = generateMonthlyReportHtml(metrics);
  assert.ok(html.includes("<!DOCTYPE html>"), "Must be valid HTML document");
  assert.ok(html.includes("Metro Health Clinic"), "Must include clinic name");
  assert.ok(html.includes("October 2026"), "Must include reporting period");
  assert.ok(html.includes("Zero-PHI Certified"), "Must include Zero-PHI certification footer");

  const email = generateMonthlyEmailSummary(metrics);
  assert.ok(email.subject.includes("Metro Health Clinic"));
  assert.ok(email.text.includes("Completed Consultations: 98"));
});

// ==========================================
// 4. S9-05: AI Operations & Anomaly Detection Engine
// ==========================================
test("S9-05: AI insights engine detects anomalies, drop-offs, and capacity bottlenecks with confidence scores", () => {
  const insights = generateStructuredAiInsights({
    funnel: {
      booked: 100,
      confirmed: 60,
      arrived: 45,
      completed: 40,
      noShow: 15,
      cancelled: 10,
      completionRate: 40,
      noShowRate: 25, // High no-show anomaly
      cancellationRate: 10,
    },
    queue: {
      avgWaitTimeMinutes: 28, // High wait time anomaly
      maxWaitTimeMinutes: 45,
      longWaitCount: 6,
    },
    automation: {
      deliveryRate: 84, // Delivery drop anomaly
      readRate: 70,
      staffHoursSaved: 12,
    },
    doctorUtilizationRate: 42, // Underutilized opportunity
  });

  assert.ok(insights.anomalies.length >= 2, "Must detect no-show and queue delay anomalies");
  const noShowAnomaly = insights.anomalies.find((a) => a.id === "ANOMALY_NO_SHOW_SPIKE");
  assert.ok(noShowAnomaly, "Must flag no-show spike anomaly");
  assert.ok(noShowAnomaly.confidenceScore >= 0.85, "Must provide high confidence score");

  assert.ok(insights.dropOffAlerts.length >= 1, "Must detect pre-confirmation drop-off");
  assert.ok(insights.capacityRecommendations.length >= 1, "Must provide capacity recommendations");
  assert.ok(insights.aggregateConfidenceScore > 0.8, "Aggregate confidence must be high");
});

// ==========================================
// 5. S9-09: Database Migration CI Gate
// ==========================================
test("S9-09: All database migrations pass format, timestamp uniqueness, and safety rules", () => {
  const migrationsDir = path.resolve(__dirname, "../supabase/migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  assert.ok(files.length >= 200, "Must have all 200+ SQL migration files present");

  const timestampSet = new Set();
  const pattern = /^(\d{14})_([a-z0-9_]+)\.sql$/;

  for (const file of files) {
    const match = file.match(pattern);
    assert.ok(match, `Filename ${file} must match YYYYMMDDHHMMSS_name.sql`);

    const ts = match[1];
    assert.ok(!timestampSet.has(ts), `Timestamp ${ts} in ${file} must be unique`);
    timestampSet.add(ts);

    const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    assert.ok(!content.toLowerCase().includes("drop database"), "Migrations must not drop database");
    assert.ok(!content.toLowerCase().includes("drop schema public"), "Migrations must not drop public schema");
  }
});

// ==========================================
// 6. S9-10: Feature Flag Engine & Tenant Overrides
// ==========================================
test("S9-10: Feature flag engine evaluates typed defaults and respects tenant overrides", () => {
  clearFeatureFlagOverrides();

  // Test default states
  assert.equal(isFeatureEnabled("voice_agent_enabled"), true);
  assert.equal(isFeatureEnabled("deposit_enforcement_enabled"), false);

  const allFlags = getAllFeatureFlags("org-tenant-a");
  assert.ok(allFlags.length >= 6, "Must define at least 6 core feature flags");

  // Test tenant-specific override
  setFeatureFlagOverride("org-tenant-a", "deposit_enforcement_enabled", true);
  assert.equal(isFeatureEnabled("deposit_enforcement_enabled", "org-tenant-a"), true);
  assert.equal(isFeatureEnabled("deposit_enforcement_enabled", "org-tenant-b"), false);

  clearFeatureFlagOverrides("org-tenant-a");
  assert.equal(isFeatureEnabled("deposit_enforcement_enabled", "org-tenant-a"), false);
});

// ==========================================
// 7. S9-12: Subsystem Health Monitoring
// ==========================================
test("S9-12: Health check engine probes subsystems and reports latencies", async () => {
  const report = await runSystemHealthChecks();
  assert.ok(["healthy", "degraded"].includes(report.status));
  assert.ok(report.uptimeSeconds >= 0);
  assert.ok(report.subsystems.database, "Must probe database subsystem");
  assert.ok(report.subsystems.voice_ai, "Must probe voice AI subsystem");
  assert.ok(report.subsystems.whatsapp, "Must probe WhatsApp subsystem");
  assert.ok(report.subsystems.runtime, "Must probe runtime memory");
  assert.ok(report.subsystems.runtime.status === "healthy");
});

// ==========================================
// 8. S9-16: Error Boundary & PWA Manifest Files
// ==========================================
test("S9-16: Root error boundary and PWA manifest exist and are well-formed", () => {
  const rootErrorPath = path.resolve(__dirname, "../app/error.tsx");
  assert.ok(fs.existsSync(rootErrorPath), "app/error.tsx must exist");

  const manifestPath = path.resolve(__dirname, "../public/manifest.json");
  assert.ok(fs.existsSync(manifestPath), "public/manifest.json must exist");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.equal(manifest.name, "OmniRelay Clinic Operations");
  assert.ok(manifest.icons.length >= 2, "Must define maskable icons");
});
