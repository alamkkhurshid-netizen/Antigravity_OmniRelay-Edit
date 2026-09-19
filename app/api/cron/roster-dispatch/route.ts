import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDailyRosterData,
  generateDailyRosterCsv,
  generateRosterEmailHtml,
  formatKolkataDate,
} from "@/lib/daily-roster";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const url = new URL(request.url);
    if (url.searchParams.get("secret") !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized cron invocation." }, { status: 401 });
    }
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { data: orgs, error: orgError } = await admin
    .from("organizations")
    .select("id,name,extra");

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }

  // Get current hour in IST (or org timezone)
  const now = new Date();
  const currentHourIST = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now).split(":")[0]; // "20"

  const todayIST = formatKolkataDate(now);
  const processedOrgs: Array<{ id: string; name: string; status: string; count?: number }> = [];

  for (const org of orgs || []) {
    const extra = (org.extra || {}) as Record<string, unknown>;
    const dispatchConfig = (extra.roster_dispatch || {}) as {
      enabled?: boolean;
      dispatch_time?: string;
      clinic_email?: string;
      send_to_clinic?: boolean;
      send_to_doctors?: boolean;
    };

    if (!dispatchConfig.enabled) {
      continue;
    }

    // Check if configured hour matches current hour (e.g. "20:00" -> "20")
    const configuredHour = (dispatchConfig.dispatch_time || "20:00").split(":")[0];
    if (configuredHour !== currentHourIST) {
      continue;
    }

    // Fetch data for this organization
    const dayStart = new Date(`${todayIST}T00:00:00+05:30`).toISOString();
    const dayEnd = new Date(new Date(`${todayIST}T00:00:00+05:30`).getTime() + 86400000).toISOString();

    const [
      { data: onboardingProfile },
      { data: appointments },
      { data: resources },
      { data: locations },
      { data: queueEntries },
      { data: providerProfiles },
    ] = await Promise.all([
      admin.from("onboarding_profiles").select("email,business_name").eq("organization_id", org.id).maybeSingle(),
      admin.from("appointments").select("id,patient_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes,payment_status,follow_up_at,follow_up_note,resource:booking_resources(name),location:business_locations(name),service:organization_services(name,duration_minutes),payment:booking_payments(payment_mode,amount_paise,status)").eq("organization_id", org.id).gte("starts_at", dayStart).lt("starts_at", dayEnd),
      admin.from("booking_resources").select("id,name,resource_type,location_id,timezone").eq("organization_id", org.id).eq("active", true),
      admin.from("business_locations").select("id,name,location_type,address,phone").eq("organization_id", org.id),
      admin.from("appointment_queue_entries").select("appointment_id,resource_id,location_id,queue_date,token_number,queue_status").eq("organization_id", org.id).eq("queue_date", todayIST),
      admin.from("provider_profiles").select("resource_id,contact_email,contact_phone,specialization").eq("organization_id", org.id),
    ]);

    const rosterData = buildDailyRosterData({
      organizationName: org.name || onboardingProfile?.business_name || "OmniRelay Clinic",
      date: todayIST,
      appointments: appointments || [],
      resources: resources || [],
      locations: locations || [],
      queueEntries: queueEntries || [],
      providerProfiles: providerProfiles || [],
    });

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "OmniRelay <notifications@omnirelay.in>";

    // Send to clinic email
    const targetClinicEmail = dispatchConfig.clinic_email || onboardingProfile?.email;
    if (dispatchConfig.send_to_clinic !== false && targetClinicEmail && targetClinicEmail.includes("@")) {
      const { subject, html } = generateRosterEmailHtml(rosterData);
      const csvAttachment = generateDailyRosterCsv(rosterData);
      if (apiKey) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromEmail,
              to: [targetClinicEmail],
              subject,
              html,
              attachments: [{ filename: `daily-roster-${todayIST}.csv`, content: Buffer.from(csvAttachment, "utf-8").toString("base64") }],
            }),
          });
        } catch (e) {
          console.error("Failed to send clinic cron email:", e);
        }
      }
    }

    // Send to doctors
    if (dispatchConfig.send_to_doctors !== false) {
      for (const doc of rosterData.doctorSummaries) {
        if (doc.contactEmail && doc.contactEmail.includes("@")) {
          const { subject, html } = generateRosterEmailHtml(rosterData, doc.resourceId);
          const csvAttachment = generateDailyRosterCsv(rosterData, doc.resourceId);
          const docSlug = doc.doctorName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
          if (apiKey) {
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: fromEmail,
                  to: [doc.contactEmail],
                  subject,
                  html,
                  attachments: [{ filename: `roster-${docSlug}-${todayIST}.csv`, content: Buffer.from(csvAttachment, "utf-8").toString("base64") }],
                }),
              });
            } catch (e) {
              console.error("Failed to send doctor cron email:", e);
            }
          }
        }
      }
    }

    processedOrgs.push({
      id: org.id,
      name: org.name,
      status: "dispatched",
      count: rosterData.totalAppointments,
    });
  }

  return NextResponse.json({
    ok: true,
    hour: currentHourIST,
    date: todayIST,
    processedCount: processedOrgs.length,
    processedOrgs,
  });
}
