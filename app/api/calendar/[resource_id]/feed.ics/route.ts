import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ical from "ical-generator";

export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: { resource_id: string } }
) {
  try {
    const resourceId = params.resource_id;
    if (!resourceId) return new NextResponse("Not Found", { status: 404 });

    const admin = createAdminClient();

    // 1. Fetch Doctor details
    const { data: resource, error: resourceError } = await admin
      .from("booking_resources")
      .select("id, name, timezone, organization:organizations(name)")
      .eq("id", resourceId)
      .eq("active", true)
      .maybeSingle();

    if (resourceError || !resource) {
      return new NextResponse("Calendar not found or inactive.", { status: 404 });
    }

    const org = Array.isArray(resource.organization) ? resource.organization[0] : resource.organization;
    const orgName = org?.name || "OmniRelay Clinic";
    const doctorName = resource.name;

    // 2. Fetch Appointments (Past 30 days to 6 months future)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixMonthsFuture = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const { data: appointments, error: apptError } = await admin
      .from("appointments")
      .select(`
        id, starts_at, ends_at, customer_name, customer_phone, notes,
        service:organization_services(name),
        location:business_locations(name)
      `)
      .eq("resource_id", resourceId)
      .eq("status", "confirmed")
      .gte("starts_at", thirtyDaysAgo)
      .lte("starts_at", sixMonthsFuture);

    if (apptError) {
      console.error("Failed to fetch appointments for feed", apptError);
      return new NextResponse("Internal Server Error", { status: 500 });
    }

    // 3. Generate Calendar
    const cal = ical({
      name: `${doctorName} - ${orgName}`,
      timezone: resource.timezone || "Asia/Kolkata",
    });

    for (const appt of appointments || []) {
      const startTime = new Date(appt.starts_at);
      const endTime = appt.ends_at ? new Date(appt.ends_at) : new Date(startTime.getTime() + 30 * 60000);
      
      const srv = Array.isArray(appt.service) ? appt.service[0] : appt.service;
      const serviceName = srv?.name || "Consultation";
      
      const loc = Array.isArray(appt.location) ? appt.location[0] : appt.location;
      const locationName = loc?.name || orgName;

      cal.createEvent({
        start: startTime,
        end: endTime,
        summary: `[${serviceName}] ${appt.customer_name || 'Patient'}`,
        description: `Patient Phone: ${appt.customer_phone || 'N/A'}\nNotes: ${appt.notes || 'None'}\n\nManaged by OmniRelay`,
        location: locationName,
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://omnirelay.in'}/app`,
      });
    }

    const icsString = cal.toString();

    // 4. Return as standard calendar content type
    return new NextResponse(icsString, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="calendar-${resourceId}.ics"`,
        "Cache-Control": "public, max-age=300", // Cache for 5 mins
      },
    });

  } catch (err) {
    console.error("Calendar feed error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
