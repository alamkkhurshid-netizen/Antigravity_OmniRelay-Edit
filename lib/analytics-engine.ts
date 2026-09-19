/**
 * OmniRelay Clinic Analytics & AI Operations Engine
 * Compliant with docs/ANALYTICS_AI_OPS_FOUNDATION.md (Stages 14A–14E)
 * 
 * Strict Zero-PHI Rule:
 * Never includes patient names, phone numbers, notes, diagnoses, or clinical text
 * in AI payloads or aggregate analytics exports.
 */

export type DateRangeKey = "today" | "7d" | "30d" | "month";

export interface RawAppointmentRecord {
  id: string;
  patient_id?: string | null;
  location_id?: string | null;
  resource_id?: string | null;
  starts_at: string;
  status: string; // 'pending' | 'payment_pending' | 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'rescheduling_required' | 'no_show'
  service_id?: string | null;
  payment?: {
    payment_mode?: string | null;
    amount_paise?: number | null;
    status?: string | null;
  } | null;
}

export interface RawQueueEntry {
  appointment_id: string;
  token_number?: number;
  queue_status: string;
  arrived_at?: string | null;
  called_at?: string | null;
  completed_at?: string | null;
}

export interface RawReminderRecord {
  id: string;
  appointment_id?: string | null;
  status: string; // 'dispatched' | 'delivered' | 'read' | 'failed' | 'skipped'
  scheduled_for?: string | null;
  sent_at?: string | null;
}

export interface RawCareTaskRecord {
  id: string;
  appointment_id?: string | null;
  status: string; // 'open' | 'claimed' | 'completed' | 'cancelled'
  priority?: string;
  due_at?: string | null;
}

export interface DoctorResource {
  id: string;
  name: string;
  location_id?: string | null;
}

export interface DoctorMetricSummary {
  resourceId: string;
  doctorName: string;
  totalBookings: number;
  confirmedCount: number;
  arrivedCount: number;
  completedCount: number;
  noShowCount: number;
  cancelledCount: number;
  completionRate: number; // percentage 0-100
  avgWaitTimeMinutes: number;
  estimatedRevenuePaise: number;
}

export interface ClinicAnalyticsResult {
  range: DateRangeKey;
  doctorFilter: string;
  generatedAt: string;

  // 1. Funnel & Attendance
  funnel: {
    booked: number;
    confirmed: number;
    arrived: number;
    completed: number;
    noShow: number;
    cancelled: number;
    rescheduled: number;
    confirmationRate: number; // confirmed / booked
    arrivalRate: number;      // arrived / confirmed
    completionRate: number;   // completed / booked
    noShowRate: number;       // no_show / confirmed
    cancellationRate: number; // cancelled / booked
  };

  // 2. Doctor Utilization & Capacity
  doctorSummaries: DoctorMetricSummary[];

  // 3. Queue Delays & Wait Times
  queueDelays: {
    totalServed: number;
    avgWaitTimeMinutes: number;
    maxWaitTimeMinutes: number;
    longWaitCount: number; // wait > 20 mins
  };

  // 4. WhatsApp Automation & Time Savings
  automation: {
    totalRemindersDispatched: number;
    deliveredCount: number;
    readCount: number;
    failedCount: number;
    deliveryRate: number; // delivered / dispatched
    readRate: number;     // read / delivered
    staffHoursSaved: number; // 4 mins per automated reminder
  };

  // 5. Revenue & Continued Care
  financialAndCare: {
    totalRevenuePaise: number;
    onlineRevenuePaise: number;
    clinicPayRevenuePaise: number;
    pendingRevenuePaise: number;
    plannedCareTasks: number;
    completedCareTasks: number;
    overdueCareTasks: number;
    careTaskCompletionRate: number;
  };

  // Deterministic Bottlenecks / Recommendations (Section 5)
  deterministicAlerts: Array<{
    ruleId: string;
    severity: "urgent" | "warning" | "info";
    title: string;
    detail: string;
    recommendedRole: "Reception lead" | "Clinic manager" | "Workspace admin";
  }>;
}

/**
 * Filter data by ISO date string based on selected range key.
 */
export function filterAppointmentsByDate(
  appointments: RawAppointmentRecord[],
  range: DateRangeKey,
  now = new Date()
): RawAppointmentRecord[] {
  let startDate: Date;

  if (range === "today") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "7d") {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "30d") {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    // "month": start of current calendar month
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return appointments.filter((app) => {
    const d = new Date(app.starts_at);
    return d >= startDate && d <= now;
  });
}

/**
 * Core Deterministic Calculation Engine
 */
export function calculateClinicAnalytics(params: {
  appointments: RawAppointmentRecord[];
  queueEntries: RawQueueEntry[];
  reminders: RawReminderRecord[];
  careTasks: RawCareTaskRecord[];
  resources: DoctorResource[];
  range: DateRangeKey;
  doctorId?: string;
  now?: Date;
}): ClinicAnalyticsResult {
  const now = params.now ?? new Date();
  let apps = filterAppointmentsByDate(params.appointments, params.range, now);

  if (params.doctorId && params.doctorId !== "all") {
    apps = apps.filter((a) => a.resource_id === params.doctorId);
  }

  const appIds = new Set(apps.map((a) => a.id));

  // 1. Funnel Calculations
  let booked = apps.length;
  let confirmed = 0;
  let arrived = 0;
  let completed = 0;
  let noShow = 0;
  let cancelled = 0;
  let rescheduled = 0;

  for (const a of apps) {
    if (a.status === "confirmed") confirmed++;
    else if (a.status === "arrived") {
      confirmed++;
      arrived++;
    } else if (a.status === "completed") {
      confirmed++;
      arrived++;
      completed++;
    } else if (a.status === "no_show") {
      confirmed++;
      noShow++;
    } else if (a.status === "cancelled") {
      cancelled++;
    } else if (a.status === "rescheduling_required") {
      rescheduled++;
    }
  }

  const confirmationRate = booked > 0 ? Math.round((confirmed / booked) * 100) : 0;
  const arrivalRate = confirmed > 0 ? Math.round((arrived / confirmed) * 100) : 0;
  const completionRate = booked > 0 ? Math.round((completed / booked) * 100) : 0;
  const noShowRate = confirmed > 0 ? Math.round((noShow / confirmed) * 100) : 0;
  const cancellationRate = booked > 0 ? Math.round((cancelled / booked) * 100) : 0;

  // 2. Queue Wait Times
  // queue delay = called_at - starts_at
  const relevantQueue = params.queueEntries.filter((q) => appIds.has(q.appointment_id));
  const appMap = new Map(apps.map((a) => [a.id, a]));

  let totalWaitMinutes = 0;
  let maxWaitTime = 0;
  let measuredWaitCount = 0;
  let longWaitCount = 0;

  for (const q of relevantQueue) {
    if (q.called_at && q.appointment_id) {
      const app = appMap.get(q.appointment_id);
      if (app?.starts_at) {
        const scheduledTime = new Date(app.starts_at).getTime();
        const calledTime = new Date(q.called_at).getTime();
        const waitMinutes = Math.max(0, Math.round((calledTime - scheduledTime) / (60 * 1000)));

        totalWaitMinutes += waitMinutes;
        measuredWaitCount++;
        if (waitMinutes > maxWaitTime) maxWaitTime = waitMinutes;
        if (waitMinutes > 20) longWaitCount++;
      }
    }
  }

  const avgWaitTimeMinutes =
    measuredWaitCount > 0 ? Math.round(totalWaitMinutes / measuredWaitCount) : 0;

  // 3. Doctor Capacity & Performance Summaries
  const docMap = new Map(params.resources.map((r) => [r.id, r.name]));
  const appsByDoctor = new Map<string, RawAppointmentRecord[]>();

  for (const a of apps) {
    const docId = a.resource_id || "unassigned";
    if (!appsByDoctor.has(docId)) appsByDoctor.set(docId, []);
    appsByDoctor.get(docId)!.push(a);
  }

  const doctorSummaries: DoctorMetricSummary[] = [];

  for (const resource of params.resources) {
    const docApps = appsByDoctor.get(resource.id) || [];
    let dConfirmed = 0;
    let dArrived = 0;
    let dCompleted = 0;
    let dNoShow = 0;
    let dCancelled = 0;
    let dRevenue = 0;

    for (const a of docApps) {
      if (a.status === "confirmed") dConfirmed++;
      else if (a.status === "arrived") {
        dConfirmed++;
        dArrived++;
      } else if (a.status === "completed") {
        dConfirmed++;
        dArrived++;
        dCompleted++;
      } else if (a.status === "no_show") {
        dConfirmed++;
        dNoShow++;
      } else if (a.status === "cancelled") {
        dCancelled++;
      }

      if (a.status !== "cancelled") {
        dRevenue += Number(a.payment?.amount_paise || 0);
      }
    }

    const dCompletionRate = docApps.length > 0 ? Math.round((dCompleted / docApps.length) * 100) : 0;

    // Doctor specific queue delays
    const docAppIds = new Set(docApps.map((a) => a.id));
    const docQueue = relevantQueue.filter((q) => docAppIds.has(q.appointment_id));
    let docWaitTotal = 0;
    let docWaitCount = 0;

    for (const q of docQueue) {
      if (q.called_at && q.appointment_id) {
        const app = appMap.get(q.appointment_id);
        if (app?.starts_at) {
          const waitMins = Math.max(0, Math.round((new Date(q.called_at).getTime() - new Date(app.starts_at).getTime()) / (60 * 1000)));
          docWaitTotal += waitMins;
          docWaitCount++;
        }
      }
    }

    doctorSummaries.push({
      resourceId: resource.id,
      doctorName: resource.name,
      totalBookings: docApps.length,
      confirmedCount: dConfirmed,
      arrivedCount: dArrived,
      completedCount: dCompleted,
      noShowCount: dNoShow,
      cancelledCount: dCancelled,
      completionRate: dCompletionRate,
      avgWaitTimeMinutes: docWaitCount > 0 ? Math.round(docWaitTotal / docWaitCount) : 0,
      estimatedRevenuePaise: dRevenue,
    });
  }

  // 4. WhatsApp Automation & Time Savings
  const relevantReminders = params.reminders.filter(
    (r) => !r.appointment_id || appIds.has(r.appointment_id)
  );
  const totalDispatched = relevantReminders.length;
  let deliveredCount = 0;
  let readCount = 0;
  let failedCount = 0;

  for (const r of relevantReminders) {
    if (r.status === "delivered" || r.status === "read") deliveredCount++;
    if (r.status === "read") readCount++;
    if (r.status === "failed") failedCount++;
  }

  const deliveryRate = totalDispatched > 0 ? Math.round((deliveredCount / totalDispatched) * 100) : 100;
  const readRate = deliveredCount > 0 ? Math.round((readCount / deliveredCount) * 100) : 0;
  // Standard benchmark: each automated WhatsApp reminder/confirmation replaces a 4-minute phone call
  const staffHoursSaved = Math.round(((deliveredCount * 4) / 60) * 10) / 10;

  // 5. Revenue & Continued Care
  let totalRevenuePaise = 0;
  let onlineRevenuePaise = 0;
  let clinicPayRevenuePaise = 0;
  let pendingRevenuePaise = 0;

  for (const a of apps) {
    if (a.status === "cancelled") continue;
    const amt = Number(a.payment?.amount_paise || 0);
    totalRevenuePaise += amt;
    if (a.payment?.status === "paid") {
      if (a.payment?.payment_mode === "full_online" || a.payment?.payment_mode === "deposit_online") {
        onlineRevenuePaise += amt;
      } else {
        clinicPayRevenuePaise += amt;
      }
    } else {
      pendingRevenuePaise += amt;
    }
  }

  const relevantTasks = params.careTasks.filter(
    (t) => !t.appointment_id || appIds.has(t.appointment_id)
  );
  const plannedTasks = relevantTasks.length;
  let completedTasks = 0;
  let overdueTasks = 0;

  for (const t of relevantTasks) {
    if (t.status === "completed") completedTasks++;
    if (t.status === "open" && t.due_at && new Date(t.due_at).getTime() < now.getTime()) {
      overdueTasks++;
    }
  }

  const careTaskCompletionRate =
    plannedTasks > 0 ? Math.round((completedTasks / plannedTasks) * 100) : 0;

  // Deterministic Rule Engine (Section 5 from ANALYTICS_AI_OPS_FOUNDATION.md)
  const deterministicAlerts: ClinicAnalyticsResult["deterministicAlerts"] = [];

  if (avgWaitTimeMinutes > 20 || longWaitCount > 2) {
    deterministicAlerts.push({
      ruleId: "RULE_QUEUE_DELAY",
      severity: "urgent",
      title: "Elevated Patient Waiting Times",
      detail: `Average patient wait time is ${avgWaitTimeMinutes} mins (${longWaitCount} visits waited >20 mins). Review reception token pacing.`,
      recommendedRole: "Reception lead",
    });
  }

  if (noShowRate > 15 && confirmed >= 4) {
    deterministicAlerts.push({
      ruleId: "RULE_HIGH_NO_SHOW",
      severity: "warning",
      title: "Higher Than Average No-Show Rate",
      detail: `No-show rate is currently ${noShowRate}%. Confirm that 24-hour and 2-hour WhatsApp reminders are successfully reaching patients.`,
      recommendedRole: "Clinic manager",
    });
  }

  if (deliveryRate < 85 && totalDispatched >= 5) {
    deterministicAlerts.push({
      ruleId: "RULE_REMINDER_DELIVERY_DROP",
      severity: "warning",
      title: "WhatsApp Reminder Delivery Dip",
      detail: `Reminder delivery rate dropped to ${deliveryRate}%. Inspect WhatsApp template readiness and opt-out rates.`,
      recommendedRole: "Workspace admin",
    });
  }

  if (overdueTasks > 3) {
    deterministicAlerts.push({
      ruleId: "RULE_OVERDUE_FOLLOW_UPS",
      severity: "info",
      title: "Continued Care Follow-up Backlog",
      detail: `${overdueTasks} scheduled follow-up tasks are overdue. Coordinate with the front desk to complete post-consultation calls.`,
      recommendedRole: "Reception lead",
    });
  }

  return {
    range: params.range,
    doctorFilter: params.doctorId || "all",
    generatedAt: now.toISOString(),
    funnel: {
      booked,
      confirmed,
      arrived,
      completed,
      noShow,
      cancelled,
      rescheduled,
      confirmationRate,
      arrivalRate,
      completionRate,
      noShowRate,
      cancellationRate,
    },
    doctorSummaries,
    queueDelays: {
      totalServed: measuredWaitCount,
      avgWaitTimeMinutes,
      maxWaitTimeMinutes: maxWaitTime,
      longWaitCount,
    },
    automation: {
      totalRemindersDispatched: totalDispatched,
      deliveredCount,
      readCount,
      failedCount,
      deliveryRate,
      readRate,
      staffHoursSaved,
    },
    financialAndCare: {
      totalRevenuePaise,
      onlineRevenuePaise,
      clinicPayRevenuePaise,
      pendingRevenuePaise,
      plannedCareTasks: plannedTasks,
      completedCareTasks: completedTasks,
      overdueCareTasks: overdueTasks,
      careTaskCompletionRate,
    },
    deterministicAlerts,
  };
}

/**
 * Generates an audit-compliant, tenant-safe CSV of clinic analytics
 * Includes UTF-8 BOM for Microsoft Excel on Windows.
 */
export function generateAnalyticsCsv(result: ClinicAnalyticsResult, clinicName: string): string {
  const bom = "\uFEFF";
  const lines: string[] = [];

  lines.push(`OMNIRELAY CLINIC ANALYTICS & OPERATIONAL SCORECARD`);
  lines.push(`Clinic:,"${clinicName.replace(/"/g, '""')}"`);
  lines.push(`Reporting Period:,${result.range.toUpperCase()}`);
  lines.push(`Doctor Filter:,${result.doctorFilter}`);
  lines.push(`Generated At:,${result.generatedAt}`);
  lines.push("");

  // Section 1: Funnel & Attendance KPIs
  lines.push(`SECTION 1: APPOINTMENT FUNNEL & CONVERSION RATES`);
  lines.push(`Metric,Count / Rate`);
  lines.push(`Total Booked Appointments,${result.funnel.booked}`);
  lines.push(`Confirmed Appointments,${result.funnel.confirmed} (${result.funnel.confirmationRate}%)`);
  lines.push(`Arrived at Clinic,${result.funnel.arrived} (${result.funnel.arrivalRate}%)`);
  lines.push(`Completed Consultations,${result.funnel.completed} (${result.funnel.completionRate}%)`);
  lines.push(`Patient No-Shows,${result.funnel.noShow} (${result.funnel.noShowRate}%)`);
  lines.push(`Cancellations,${result.funnel.cancelled} (${result.funnel.cancellationRate}%)`);
  lines.push("");

  // Section 2: Doctor-wise Performance Breakdown
  lines.push(`SECTION 2: DOCTOR-WISE LOAD & EFFICIENCY`);
  lines.push(`Doctor Name,Bookings,Confirmed,Arrived,Completed,No-Shows,Cancelled,Completion Rate %,Avg Wait (min),Est Revenue (INR)`);
  for (const doc of result.doctorSummaries) {
    const rev = (doc.estimatedRevenuePaise / 100).toFixed(2);
    lines.push(
      `"${doc.doctorName.replace(/"/g, '""')}",${doc.totalBookings},${doc.confirmedCount},${doc.arrivedCount},${doc.completedCount},${doc.noShowCount},${doc.cancelledCount},${doc.completionRate}%,${doc.avgWaitTimeMinutes}m,₹${rev}`
    );
  }
  lines.push("");

  // Section 3: WhatsApp Automation & Time Savings
  lines.push(`SECTION 3: WHATSAPP AUTOMATION & STAFF SAVINGS`);
  lines.push(`Reminders Dispatched,${result.automation.totalRemindersDispatched}`);
  lines.push(`Delivered Successfully,${result.automation.deliveredCount} (${result.automation.deliveryRate}%)`);
  lines.push(`Read Receipts,${result.automation.readCount} (${result.automation.readRate}%)`);
  lines.push(`Failed Dispatches,${result.automation.failedCount}`);
  lines.push(`Estimated Staff Hours Saved,${result.automation.staffHoursSaved} hours`);
  lines.push("");

  // Section 4: Operational Bottlenecks
  lines.push(`SECTION 4: ACTIVE OPERATIONAL ALERTS`);
  lines.push(`Severity,Alert Title,Accountable Role,Detail`);
  if (result.deterministicAlerts.length === 0) {
    lines.push(`Normal,All clinic operational metrics within target thresholds,Clinic Manager,None`);
  } else {
    for (const a of result.deterministicAlerts) {
      lines.push(
        `${a.severity.toUpperCase()},"${a.title.replace(/"/g, '""')}","${a.recommendedRole}","${a.detail.replace(/"/g, '""')}"`
      );
    }
  }

  return bom + lines.join("\r\n");
}

/**
 * Zero-PHI AI Sanitizer
 * Produces a minimal numeric payload for Gemini narration without any patient identifiable data.
 */
export function buildSanitizedAiPromptPayload(result: ClinicAnalyticsResult, clinicName: string) {
  return {
    clinicName,
    period: result.range,
    funnel: {
      booked: result.funnel.booked,
      confirmed: result.funnel.confirmed,
      completed: result.funnel.completed,
      noShowRate: `${result.funnel.noShowRate}%`,
      completionRate: `${result.funnel.completionRate}%`,
      cancellationRate: `${result.funnel.cancellationRate}%`,
    },
    avgWaitTimeMinutes: result.queueDelays.avgWaitTimeMinutes,
    longWaitPatientsCount: result.queueDelays.longWaitCount,
    staffHoursSaved: `${result.automation.staffHoursSaved} hours`,
    whatsappDeliveryRate: `${result.automation.deliveryRate}%`,
    doctorLoads: result.doctorSummaries.map((d) => ({
      doctor: d.doctorName,
      bookings: d.totalBookings,
      completionRate: `${d.completionRate}%`,
      avgWait: `${d.avgWaitTimeMinutes}m`,
    })),
    detectedBottlenecks: result.deterministicAlerts.map((a) => ({
      issue: a.title,
      role: a.recommendedRole,
      detail: a.detail,
    })),
  };
}
