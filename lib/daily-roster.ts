/**
 * Domain utilities for generating and exporting the Daily Patient Booking Story
 * and formatting automated email dispatches for clinics and doctors.
 */

export type RosterAppointment = {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  starts_at: string;
  ends_at?: string | null;
  status: string;
  source?: string | null;
  notes?: string | null;
  payment_status?: string | null;
  follow_up_at?: string | null;
  follow_up_note?: string | null;
  resource_id: string;
  location_id: string;
  service_id?: string | null;
  resource_name?: string | null;
  location_name?: string | null;
  service_name?: string | null;
  payment_mode?: string | null;
  amount_paise?: number | null;
  token_number?: number | null;
  queue_status?: string | null;
};

export type DoctorSummary = {
  resourceId: string;
  doctorName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  chamberName: string;
  totalBookings: number;
  confirmedCount: number;
  arrivedCount: number;
  completedCount: number;
  cancelledCount: number;
  pendingCount: number;
  estimatedRevenuePaise: number;
};

export type DailyRosterData = {
  organizationName: string;
  date: string;
  generatedAt: string;
  totalAppointments: number;
  doctorSummaries: DoctorSummary[];
  appointments: RosterAppointment[];
};

export type RawAppointmentInput = {
  id: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  starts_at: string;
  ends_at?: string | null;
  status: string;
  source?: string | null;
  notes?: string | null;
  payment_status?: string | null;
  follow_up_at?: string | null;
  follow_up_note?: string | null;
  resource_id: string;
  location_id: string;
  service_id?: string | null;
  resource?: { name: string } | null;
  location?: { name: string } | null;
  service?: { name: string; duration_minutes?: number } | null;
  payment?: { payment_mode?: string | null; amount_paise?: number | null; status?: string | null } | null;
};

export type ResourceOption = {
  id: string;
  name: string;
  resource_type?: string;
  location_id?: string | null;
  provider_profiles?: {
    contact_email?: string | null;
    contact_phone?: string | null;
    specialization?: string | null;
  } | null;
};

export type LocationOption = {
  id: string;
  name: string;
};

export type QueueEntryOption = {
  appointment_id: string;
  token_number: number;
  queue_status: string;
};

export const formatKolkataTime = (isoString: string): string => {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
};

export const formatKolkataDate = (dateOrIso: Date | string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date(dateOrIso));
  } catch {
    return String(dateOrIso).split("T")[0];
  }
};

const escapeCsvField = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

export function buildDailyRosterData({
  organizationName,
  date,
  appointments,
  resources = [],
  locations = [],
  queueEntries = [],
  providerProfiles = [],
}: {
  organizationName: string;
  date: string;
  appointments: RawAppointmentInput[];
  resources?: ResourceOption[];
  locations?: LocationOption[];
  queueEntries?: QueueEntryOption[];
  providerProfiles?: Array<{ resource_id: string; contact_email?: string | null; contact_phone?: string | null }>;
}): DailyRosterData {
  const resourceMap = new Map(resources.map((r) => [r.id, r]));
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  const queueMap = new Map(queueEntries.map((q) => [q.appointment_id, q]));
  const profileMap = new Map(providerProfiles.map((p) => [p.resource_id, p]));

  // Filter appointments for the targeted date in Asia/Kolkata timezone
  const dateAppointments = appointments.filter((app) => {
    const appDate = formatKolkataDate(app.starts_at);
    return appDate === date;
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  // Build enriched appointments
  const enrichedAppointments: RosterAppointment[] = dateAppointments.map((app) => {
    const queue = queueMap.get(app.id);
    const res = resourceMap.get(app.resource_id);
    const loc = locationMap.get(app.location_id);

    return {
      id: app.id,
      customer_name: app.customer_name || "Unknown Patient",
      customer_phone: app.customer_phone || null,
      customer_email: app.customer_email || null,
      starts_at: app.starts_at,
      ends_at: app.ends_at || null,
      status: app.status || "confirmed",
      source: app.source || null,
      notes: app.notes || null,
      payment_status: app.payment?.status || app.payment_status || "pending",
      follow_up_at: app.follow_up_at || null,
      follow_up_note: app.follow_up_note || null,
      resource_id: app.resource_id,
      location_id: app.location_id,
      service_id: app.service_id || null,
      resource_name: app.resource?.name || res?.name || "Unassigned Doctor",
      location_name: app.location?.name || loc?.name || "General Chamber",
      service_name: app.service?.name || "General Consultation",
      payment_mode: app.payment?.payment_mode || "pay_at_clinic",
      amount_paise: app.payment?.amount_paise || null,
      token_number: queue?.token_number || null,
      queue_status: queue?.queue_status || null,
    };
  });

  // Aggregate doctor summaries
  // Include all active resources or doctors present in appointments
  const doctorIds = new Set<string>();
  resources.forEach((r) => doctorIds.add(r.id));
  enrichedAppointments.forEach((a) => doctorIds.add(a.resource_id));

  const doctorSummaries: DoctorSummary[] = [];

  for (const docId of doctorIds) {
    const res = resourceMap.get(docId);
    const prof = profileMap.get(docId) || res?.provider_profiles;
    const docAppointments = enrichedAppointments.filter((a) => a.resource_id === docId);

    const docName = res?.name || docAppointments[0]?.resource_name || "Doctor";
    const chamberName = res?.location_id ? (locationMap.get(res.location_id)?.name || "Chamber") : (docAppointments[0]?.location_name || "Chamber");

    let confirmedCount = 0;
    let arrivedCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let pendingCount = 0;
    let estRevenuePaise = 0;

    for (const app of docAppointments) {
      const s = (app.status || "").toLowerCase();
      if (s === "confirmed") confirmedCount++;
      else if (s === "arrived") arrivedCount++;
      else if (s === "completed" || s === "in_consultation") completedCount++;
      else if (s === "cancelled" || s === "no_show") cancelledCount++;
      else pendingCount++;

      if (app.amount_paise && s !== "cancelled" && s !== "no_show") {
        estRevenuePaise += app.amount_paise;
      }
    }

    doctorSummaries.push({
      resourceId: docId,
      doctorName: docName,
      contactEmail: prof?.contact_email || null,
      contactPhone: prof?.contact_phone || null,
      chamberName,
      totalBookings: docAppointments.length,
      confirmedCount,
      arrivedCount,
      completedCount,
      cancelledCount,
      pendingCount,
      estimatedRevenuePaise: estRevenuePaise,
    });
  }

  // Sort doctors by booking count descending, then name
  doctorSummaries.sort((a, b) => b.totalBookings - a.totalBookings || a.doctorName.localeCompare(b.doctorName));

  return {
    organizationName,
    date,
    generatedAt: new Date().toISOString(),
    totalAppointments: enrichedAppointments.length,
    doctorSummaries,
    appointments: enrichedAppointments,
  };
}

/**
 * Generates an RFC 4180 compliant CSV string with a UTF-8 BOM (\uFEFF)
 * so Microsoft Excel on Windows renders all characters, currencies, and headers cleanly.
 */
export function generateDailyRosterCsv(
  roster: DailyRosterData,
  filterResourceId?: string
): string {
  const isDoctorSpecific = Boolean(filterResourceId);
  const targetAppointments = isDoctorSpecific
    ? roster.appointments.filter((a) => a.resource_id === filterResourceId)
    : roster.appointments;

  const targetSummaries = isDoctorSpecific
    ? roster.doctorSummaries.filter((d) => d.resourceId === filterResourceId)
    : roster.doctorSummaries;

  const lines: string[] = [];

  // UTF-8 Byte Order Mark
  const bom = "\uFEFF";

  // Document Title & Metadata
  lines.push(`${escapeCsvField("OMNIRELAY — CLINIC DAILY PATIENT BOOKING STORY")}`);
  lines.push(`${escapeCsvField("Clinic / Organization:")},${escapeCsvField(roster.organizationName)}`);
  lines.push(`${escapeCsvField("Roster Date:")},${escapeCsvField(roster.date)}`);
  lines.push(`${escapeCsvField("Generated At (IST):")},${escapeCsvField(formatKolkataTime(roster.generatedAt))}`);
  lines.push(`${escapeCsvField("Total Appointments:")},${escapeCsvField(targetAppointments.length)}`);
  lines.push("");

  // SECTION 1: DOCTOR SUMMARY TABLE
  lines.push(`${escapeCsvField("SECTION 1: DOCTOR-WISE BOOKING SUMMARY")}`);
  const summaryHeaders = [
    "Doctor Name",
    "Chamber / Room",
    "Total Booked",
    "Confirmed",
    "Arrived / Completed",
    "Cancelled / No-Show",
    "Pending / Other",
    "Est. Value (INR)",
  ];
  lines.push(summaryHeaders.map(escapeCsvField).join(","));

  for (const doc of targetSummaries) {
    const row = [
      doc.doctorName,
      doc.chamberName,
      doc.totalBookings,
      doc.confirmedCount,
      doc.arrivedCount + doc.completedCount,
      doc.cancelledCount,
      doc.pendingCount,
      (doc.estimatedRevenuePaise / 100).toFixed(2),
    ];
    lines.push(row.map(escapeCsvField).join(","));
  }

  // Clinic Totals Row
  const totalBooked = targetSummaries.reduce((sum, d) => sum + d.totalBookings, 0);
  const totalConfirmed = targetSummaries.reduce((sum, d) => sum + d.confirmedCount, 0);
  const totalSeen = targetSummaries.reduce((sum, d) => sum + d.arrivedCount + d.completedCount, 0);
  const totalCancelled = targetSummaries.reduce((sum, d) => sum + d.cancelledCount, 0);
  const totalPending = targetSummaries.reduce((sum, d) => sum + d.pendingCount, 0);
  const totalRevenue = targetSummaries.reduce((sum, d) => sum + d.estimatedRevenuePaise, 0);

  const totalRow = [
    "TOTAL CLINIC LOAD",
    "—",
    totalBooked,
    totalConfirmed,
    totalSeen,
    totalCancelled,
    totalPending,
    (totalRevenue / 100).toFixed(2),
  ];
  lines.push(totalRow.map(escapeCsvField).join(","));
  lines.push("");

  // SECTION 2: DETAILED CHRONOLOGICAL PATIENT ROSTER
  lines.push(`${escapeCsvField("SECTION 2: CHRONOLOGICAL PATIENT RUN-SHEET")}`);
  const rosterHeaders = [
    "Time Slot (IST)",
    "Token #",
    "Doctor Name",
    "Chamber",
    "Patient Name",
    "Phone / WhatsApp",
    "Service / Visit Reason",
    "Status",
    "Payment Mode",
    "Payment Status",
    "Follow-up Date",
    "Clinical Notes",
  ];
  lines.push(rosterHeaders.map(escapeCsvField).join(","));

  for (const app of targetAppointments) {
    const timeLabel = formatKolkataTime(app.starts_at);
    const tokenLabel = app.token_number ? `#${app.token_number}` : "—";
    const followUpLabel = app.follow_up_at ? formatKolkataDate(app.follow_up_at) : "";

    const row = [
      timeLabel,
      tokenLabel,
      app.resource_name || "Doctor",
      app.location_name || "Chamber",
      app.customer_name,
      app.customer_phone || "",
      app.service_name || "Consultation",
      (app.status || "").replace(/_/g, " "),
      (app.payment_mode || "").replace(/_/g, " "),
      app.payment_status || "pending",
      followUpLabel,
      app.notes || app.follow_up_note || "",
    ];
    lines.push(row.map(escapeCsvField).join(","));
  }

  return bom + lines.join("\r\n");
}

/**
 * Generates responsive HTML email content for the Daily Roster dispatch.
 */
export function generateRosterEmailHtml(
  roster: DailyRosterData,
  doctorResourceId?: string
): { subject: string; html: string; recipientDoctorName?: string } {
  const isDoctorEmail = Boolean(doctorResourceId);
  const targetDoctor = isDoctorEmail
    ? roster.doctorSummaries.find((d) => d.resourceId === doctorResourceId)
    : null;

  const targetAppointments = isDoctorEmail
    ? roster.appointments.filter((a) => a.resource_id === doctorResourceId)
    : roster.appointments;

  const subject = isDoctorEmail
    ? `[OmniRelay] Your Patient Schedule for ${roster.date} — Dr. ${targetDoctor?.doctorName || "Doctor"}`
    : `[OmniRelay] Daily Patient Roster & Summary for ${roster.organizationName} — ${roster.date}`;

  const greeting = isDoctorEmail
    ? `Dear Dr. ${targetDoctor?.doctorName || "Doctor"},`
    : `Dear Clinic Operations Team,`;

  const summaryIntro = isDoctorEmail
    ? `Here is your scheduled patient roster for <strong>${roster.date}</strong> at ${targetDoctor?.chamberName || "your consultation chamber"}. You have <strong>${targetAppointments.length} appointment(s)</strong> scheduled.`
    : `Here is the daily patient booking summary and end-of-day roster for <strong>${roster.organizationName}</strong> on <strong>${roster.date}</strong>. A full spreadsheet is also attached for your records.`;

  // HTML Table Rows for Doctor Summary (only on Clinic Master Email)
  const doctorSummaryRows = roster.doctorSummaries.map((doc) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px 12px; font-weight: 600; color: #1e293b;">${doc.doctorName}</td>
      <td style="padding: 10px 12px; color: #64748b;">${doc.chamberName}</td>
      <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #0f172a;">${doc.totalBookings}</td>
      <td style="padding: 10px 12px; text-align: center; color: #16a34a;">${doc.confirmedCount}</td>
      <td style="padding: 10px 12px; text-align: center; color: #2563eb;">${doc.arrivedCount + doc.completedCount}</td>
      <td style="padding: 10px 12px; text-align: center; color: #dc2626;">${doc.cancelledCount}</td>
    </tr>
  `).join("");

  // Patient schedule rows (up to 30 preview in email body)
  const previewAppointments = targetAppointments.slice(0, 30);
  const patientRows = previewAppointments.map((app) => `
    <tr style="border-bottom: 1px solid #f1f5f9; font-size: 13px;">
      <td style="padding: 8px 10px; font-weight: 600; color: #0f172a;">${formatKolkataTime(app.starts_at)}</td>
      <td style="padding: 8px 10px; color: #475569;">${app.token_number ? `#${app.token_number}` : "—"}</td>
      ${!isDoctorEmail ? `<td style="padding: 8px 10px; color: #1e293b;">${app.resource_name}</td>` : ""}
      <td style="padding: 8px 10px; font-weight: 600; color: #1e293b;">${app.customer_name}</td>
      <td style="padding: 8px 10px; color: #475569;">${app.customer_phone || "—"}</td>
      <td style="padding: 8px 10px; color: #64748b;">${app.service_name || "Consultation"}</td>
      <td style="padding: 8px 10px; text-transform: capitalize; color: ${app.status === "confirmed" ? "#16a34a" : "#475569"};">${app.status.replace(/_/g, " ")}</td>
    </tr>
  `).join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background: #0f172a; padding: 24px; color: #ffffff;">
      <span style="font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8; font-weight: 700;">OmniRelay Clinical Operations</span>
      <h2 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 700;">${roster.organizationName}</h2>
      <p style="margin: 4px 0 0 0; font-size: 14px; color: #cbd5e1;">Daily Patient Booking Story · ${roster.date}</p>
    </div>

    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0;">${greeting}</p>
      <p style="font-size: 14px; line-height: 1.5; color: #334155;">${summaryIntro}</p>

      ${!isDoctorEmail ? `
      <h3 style="font-size: 15px; font-weight: 700; margin: 24px 0 12px 0; color: #0f172a;">Doctor-wise Booking Summary</h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569;">
              <th style="padding: 10px 12px;">Doctor</th>
              <th style="padding: 10px 12px;">Chamber</th>
              <th style="padding: 10px 12px; text-align: center;">Total</th>
              <th style="padding: 10px 12px; text-align: center;">Confirmed</th>
              <th style="padding: 10px 12px; text-align: center;">Seen</th>
              <th style="padding: 10px 12px; text-align: center;">Cancelled</th>
            </tr>
          </thead>
          <tbody>
            ${doctorSummaryRows}
          </tbody>
        </table>
      </div>
      ` : ""}

      <h3 style="font-size: 15px; font-weight: 700; margin: 28px 0 12px 0; color: #0f172a;">
        ${isDoctorEmail ? "Your Patient Appointments" : "Patient Schedule Run-Sheet"} (${targetAppointments.length} total)
      </h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #475569;">
              <th style="padding: 8px 10px;">Time</th>
              <th style="padding: 8px 10px;">Token</th>
              ${!isDoctorEmail ? `<th style="padding: 8px 10px;">Doctor</th>` : ""}
              <th style="padding: 8px 10px;">Patient Name</th>
              <th style="padding: 8px 10px;">Phone</th>
              <th style="padding: 8px 10px;">Service</th>
              <th style="padding: 8px 10px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${patientRows}
          </tbody>
        </table>
      </div>
      ${targetAppointments.length > 30 ? `<p style="font-size: 12px; color: #64748b; margin-top: 8px;">* Showing first 30 appointments. Please refer to the attached spreadsheet for the complete list.</p>` : ""}

      <div style="margin-top: 32px; padding: 16px; background: #f1f5f9; border-radius: 8px; font-size: 13px; color: #475569;">
        📎 <strong>Attached:</strong> Complete CSV spreadsheet formatted for Microsoft Excel with full patient notes and payment breakdown.
      </div>
    </div>

    <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      This automated briefing was generated by OmniRelay on ${formatKolkataTime(roster.generatedAt)} IST.
    </div>
  </div>
</body>
</html>
  `.trim();

  return {
    subject,
    html,
    recipientDoctorName: targetDoctor?.doctorName,
  };
}
