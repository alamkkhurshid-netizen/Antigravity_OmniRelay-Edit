import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ical from "ical-generator";

export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: { patient_id: string } }
) {
  try {
    const patientId = params.patient_id;
    if (!patientId) return new NextResponse("Not Found", { status: 404 });

    const admin = createAdminClient();

    // 1. Fetch Patient details
    const { data: patient, error: patientError } = await admin
      .from("patient_profiles")
      .select("id, full_name, organization:organizations(name)")
      .eq("id", patientId)
      .maybeSingle();

    if (patientError || !patient) {
      return new NextResponse("Patient calendar not found.", { status: 404 });
    }

    const org = Array.isArray(patient.organization) ? patient.organization[0] : patient.organization;
    const orgName = org?.name || "OmniRelay Clinic";

    // 2. Fetch Appointments (Past 30 days to 1 year future)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oneYearFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const { data: appointments, error: apptError } = await admin
      .from("appointments")
      .select(`
        id, starts_at, ends_at, notes,
        service:organization_services(name),
        location:business_locations(name, address),
        resource:booking_resources(name)
      `)
      .eq("patient_id", patientId)
      .eq("status", "confirmed")
      .gte("starts_at", thirtyDaysAgo)
      .lte("starts_at", oneYearFuture);

    if (apptError) {
      console.error("Failed to fetch appointments for patient feed", apptError);
      return new NextResponse("Internal Server Error", { status: 500 });
    }

    // 3. Generate Calendar
    const cal = ical({
      name: `My Appointments - ${orgName}`,
      timezone: "Asia/Kolkata",
    });

    for (const appt of appointments || []) {
      const startTime = new Date(appt.starts_at);
      const endTime = appt.ends_at ? new Date(appt.ends_at) : new Date(startTime.getTime() + 30 * 60000);
      
      const srv = Array.isArray(appt.service) ? appt.service[0] : appt.service;
      const serviceName = srv?.name || "Consultation";
      
      const loc = Array.isArray(appt.location) ? appt.location[0] : appt.location;
      const locationName = loc?.name || orgName;
      const locationAddress = (loc as any)?.address || "";

      const doc = Array.isArray(appt.resource) ? appt.resource[0] : appt.resource;
      const doctorName = doc?.name || "Doctor";

      cal.createEvent({
        start: startTime,
        end: endTime,
        summary: `[${orgName}] ${serviceName} with ${doctorName}`,
        description: `Notes: ${appt.notes || 'None'}\n\nManaged by OmniRelay`,
        location: locationAddress ? `${locationName}, ${locationAddress}` : locationName,
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://omnirelay.in'}/manage`,
      });
    }

    const icsString = cal.toString();

    // 4. Return as standard calendar content type
    return new NextResponse(icsString, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="my-appointments-${patientId.slice(0, 8)}.ics"`,
        "Cache-Control": "public, max-age=300", 
      },
    });

  } catch (err) {
    console.error("Patient calendar feed error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
