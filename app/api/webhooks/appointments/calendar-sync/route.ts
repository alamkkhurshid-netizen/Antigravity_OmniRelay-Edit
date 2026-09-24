import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { google } from "googleapis";
import ical from "ical-generator";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const record = payload.record;
    
    // Only process if status is confirmed and we have starts_at
    if (!record || record.status !== "confirmed" || !record.starts_at) {
      return NextResponse.json({ ok: true, message: "Ignored: not confirmed or no start time" });
    }

    // We only want to run this if it's newly confirmed. If it was already confirmed, maybe it's rescheduled?
    if (payload.type === "UPDATE" && payload.old_record && payload.old_record.status === "confirmed" && payload.old_record.starts_at === record.starts_at) {
      return NextResponse.json({ ok: true, message: "Ignored: no change to schedule" });
    }

    const admin = createAdminClient();

    // Fetch related names (doctor, service, clinic) for the description
    const { data: appointmentDetails } = await admin
      .from("appointments")
      .select(`
        resource:booking_resources(name),
        service:organization_services(name),
        location:business_locations(name),
        organization:organizations(name)
      `)
      .eq("id", record.id)
      .single();

    const doctorName = appointmentDetails?.resource?.name || "Doctor";
    const serviceName = appointmentDetails?.service?.name || "Consultation";
    const clinicName = appointmentDetails?.location?.name || appointmentDetails?.organization?.name || "OmniRelay Clinic";

    const startTime = new Date(record.starts_at);
    const endTime = record.ends_at ? new Date(record.ends_at) : new Date(startTime.getTime() + 30 * 60000); // default 30m

    let results = { patientSync: false, doctorSync: false, googleEventId: null as string | null };

    // --- 1. PATIENT SYNC (.ics via email) ---
    if (record.customer_email && process.env.RESEND_API_KEY) {
      const cal = ical({ name: `${clinicName} Appointments` });
      cal.createEvent({
        start: startTime,
        end: endTime,
        summary: `Appointment with ${doctorName}`,
        description: `Service: ${serviceName}\nClinic: ${clinicName}`,
        location: clinicName,
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://omnirelay.in'}/manage`,
      });

      const icsString = cal.toString();
      const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "OmniRelay <notifications@omnirelay.in>";
      
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2>Appointment Confirmed</h2>
          <p>Dear ${record.customer_name || 'Patient'},</p>
          <p>Your appointment for <strong>${serviceName}</strong> with <strong>${doctorName}</strong> is confirmed.</p>
          <p><strong>Date & Time:</strong> ${startTime.toLocaleString()}</p>
          <p><strong>Clinic:</strong> ${clinicName}</p>
          <br/>
          <p>Please find the attached calendar invitation (.ics) to add this to your personal calendar (Apple Calendar, Gmail, Outlook).</p>
          <br/>
          <p>Regards,<br>${clinicName} via OmniRelay</p>
        </div>
      `;

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [record.customer_email],
            subject: `Confirmed: Appointment with ${doctorName}`,
            html: emailHtml,
            attachments: [
              {
                filename: "invite.ics",
                content: Buffer.from(icsString, 'utf-8').toString("base64")
              }
            ]
          })
        });
        results.patientSync = true;
      } catch (err) {
        console.error("Failed to send ics email", err);
      }
    }

    // --- 2. DOCTOR SYNC (Google Calendar) ---
    if (record.resource_id && record.organization_id) {
      const { data: connection } = await admin
        .from("google_calendar_connections")
        .select("access_token, refresh_token")
        .eq("organization_id", record.organization_id)
        .eq("resource_id", record.resource_id)
        .single();

      if (connection && connection.access_token) {
        try {
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.NEXT_PUBLIC_APP_URL || 'https://omnirelay.in'}/api/auth/google-calendar/callback`
          );

          oauth2Client.setCredentials({
            access_token: connection.access_token,
            refresh_token: connection.refresh_token,
          });

          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          const response = await calendar.events.insert({
            calendarId: "primary",
            requestBody: {
              summary: `[OMNI] ${serviceName} - ${record.customer_name || 'Patient'}`,
              description: `Patient Phone: ${record.customer_phone || 'N/A'}\nPatient Email: ${record.customer_email || 'N/A'}\nNotes: ${record.notes || 'None'}\n\nManaged by OmniRelay`,
              start: { dateTime: startTime.toISOString() },
              end: { dateTime: endTime.toISOString() },
            }
          });
          
          results.doctorSync = true;
          // You could optionally save the response.data.id back to the appointment here
          if (response.data.id) {
            results.googleEventId = response.data.id;
          }
        } catch (err) {
          console.error("Failed to insert into Google Calendar", err);
        }
      }
    }

    return NextResponse.json({ ok: true, results });

  } catch (error) {
    console.error("Calendar sync webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
