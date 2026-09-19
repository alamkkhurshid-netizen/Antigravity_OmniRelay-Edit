import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import {
  buildDailyRosterData,
  generateDailyRosterCsv,
  generateRosterEmailHtml,
  formatKolkataDate,
} from "@/lib/daily-roster";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

interface EmailSendResult {
  recipient: string;
  type: "clinic" | "doctor";
  doctorName?: string;
  status: "sent" | "simulated" | "failed" | "skipped_no_email";
  subject: string;
  error?: string;
}

async function sendRosterEmail({
  apiKey,
  fromEmail,
  to,
  subject,
  html,
  csvAttachment,
  filename,
}: {
  apiKey?: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  csvAttachment: string;
  filename: string;
}): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  if (!apiKey) {
    // In dev or test environments without an email API key configured, simulate cleanly
    return { success: true, simulated: true };
  }

  try {
    const base64Content = Buffer.from(csvAttachment, "utf-8").toString("base64");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        attachments: [
          {
            filename,
            content: base64Content,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Email service error: ${response.status} ${errorText}` };
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  if (!organization) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  }

  let body: { date?: string; force?: boolean; scope?: string } = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const requestedDate = body.date || formatKolkataDate(new Date());
  if (!datePattern.test(requestedDate)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  // Calculate day boundary in Asia/Kolkata
  const dayStart = new Date(`${requestedDate}T00:00:00+05:30`).toISOString();
  const dayEnd = new Date(
    new Date(`${requestedDate}T00:00:00+05:30`).getTime() + 86400000
  ).toISOString();

  // Fetch organization profile for clinic email
  const [
    { data: onboardingProfile },
    { data: appointments, error: appError },
    { data: resources },
    { data: locations },
    { data: queueEntries },
    { data: providerProfiles },
  ] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("email,primary_phone,business_name")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("appointments")
      .select(
        "id,patient_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes,payment_status,follow_up_at,follow_up_note,resource:booking_resources(name),location:business_locations(name),service:organization_services(name,duration_minutes),payment:booking_payments(payment_mode,amount_paise,status)"
      )
      .eq("organization_id", organization.id)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .order("starts_at"),
    supabase
      .from("booking_resources")
      .select("id,name,resource_type,location_id,timezone")
      .eq("organization_id", organization.id)
      .eq("active", true),
    supabase
      .from("business_locations")
      .select("id,name,location_type,address,phone")
      .eq("organization_id", organization.id),
    supabase
      .from("appointment_queue_entries")
      .select("appointment_id,resource_id,location_id,queue_date,token_number,queue_status")
      .eq("organization_id", organization.id)
      .eq("queue_date", requestedDate),
    supabase
      .from("provider_profiles")
      .select("resource_id,contact_email,contact_phone,specialization")
      .eq("organization_id", organization.id),
  ]);

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }

  // Extract dispatch settings from organization.extra
  const extra = (organization.extra || {}) as Record<string, unknown>;
  const dispatchConfig = (extra.roster_dispatch || {}) as {
    enabled?: boolean;
    dispatch_time?: string;
    clinic_email?: string;
    send_to_clinic?: boolean;
    send_to_doctors?: boolean;
  };

  const sendToClinic = dispatchConfig.send_to_clinic !== false; // default true
  const sendToDoctors = dispatchConfig.send_to_doctors !== false; // default true
  const targetClinicEmail = dispatchConfig.clinic_email || onboardingProfile?.email;

  const rosterData = buildDailyRosterData({
    organizationName: organization.name || onboardingProfile?.business_name || "OmniRelay Clinic",
    date: requestedDate,
    appointments: appointments || [],
    resources: resources || [],
    locations: locations || [],
    queueEntries: queueEntries || [],
    providerProfiles: providerProfiles || [],
  });

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "OmniRelay <notifications@omnirelay.in>";
  const results: EmailSendResult[] = [];

  // 1. Dispatch to Clinic Email
  if (sendToClinic) {
    if (targetClinicEmail && targetClinicEmail.includes("@")) {
      const { subject, html } = generateRosterEmailHtml(rosterData);
      const csvAttachment = generateDailyRosterCsv(rosterData);
      const filename = `daily-roster-${requestedDate}.csv`;

      const sendResult = await sendRosterEmail({
        apiKey,
        fromEmail,
        to: targetClinicEmail,
        subject,
        html,
        csvAttachment,
        filename,
      });

      results.push({
        recipient: targetClinicEmail,
        type: "clinic",
        status: sendResult.success ? (sendResult.simulated ? "simulated" : "sent") : "failed",
        subject,
        error: sendResult.error,
      });
    } else {
      results.push({
        recipient: targetClinicEmail || "None",
        type: "clinic",
        status: "skipped_no_email",
        subject: "",
        error: "No valid clinic email configured.",
      });
    }
  }

  // 2. Dispatch to Doctors
  if (sendToDoctors) {
    for (const doc of rosterData.doctorSummaries) {
      if (doc.contactEmail && doc.contactEmail.includes("@")) {
        const { subject, html } = generateRosterEmailHtml(rosterData, doc.resourceId);
        const csvAttachment = generateDailyRosterCsv(rosterData, doc.resourceId);
        const docSlug = doc.doctorName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        const filename = `roster-${docSlug}-${requestedDate}.csv`;

        const sendResult = await sendRosterEmail({
          apiKey,
          fromEmail,
          to: doc.contactEmail,
          subject,
          html,
          csvAttachment,
          filename,
        });

        results.push({
          recipient: doc.contactEmail,
          type: "doctor",
          doctorName: doc.doctorName,
          status: sendResult.success ? (sendResult.simulated ? "simulated" : "sent") : "failed",
          subject,
          error: sendResult.error,
        });
      } else {
        results.push({
          recipient: doc.contactEmail || "None",
          type: "doctor",
          doctorName: doc.doctorName,
          status: "skipped_no_email",
          subject: "",
          error: `No contact email configured for Dr. ${doc.doctorName}`,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    date: requestedDate,
    totalAppointments: rosterData.totalAppointments,
    doctorsCount: rosterData.doctorSummaries.length,
    results,
    liveEmailConfigured: Boolean(apiKey),
  });
}
