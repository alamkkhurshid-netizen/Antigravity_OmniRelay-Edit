import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import ical from "ical-generator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource_id: string }> }
) {
  try {
    const { resource_id } = await params;
    const resourceId = resource_id;
    if (!resourceId) {
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 1. Strict Authentication: Calendar feed requires an authenticated user session
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized: Authentication required to access clinical calendar feeds.", {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 2. Fetch Doctor details (enforcing RLS)
    const { data: resource, error: resourceError } = await supabase
      .from("booking_resources")
      .select("id, name, timezone, organization_id, organization:organizations(name)")
      .eq("id", resourceId)
      .eq("active", true)
      .maybeSingle();

    if (resourceError || !resource) {
      return new NextResponse("Calendar not found or access denied.", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 3. Strict Authorization: Verify caller is an authenticated member of this organization
    const { data: isMember } = await supabase.rpc("is_organization_member", {
      target_organization_id: resource.organization_id,
      minimum_role: "member",
    });

    if (!isMember) {
      return new NextResponse("Forbidden: Access denied to this clinical calendar feed.", {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const org = Array.isArray(resource.organization) ? resource.organization[0] : resource.organization;
    const orgName = org?.name || "OmniRelay Clinic";
    const doctorName = resource.name;

    // 4. Fetch Appointments (Scoped by RLS, bounded window)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixMonthsFuture = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const { data: appointments, error: apptError } = await supabase
      .from("appointments")
      .select(`
        id, starts_at, ends_at, customer_name,
        service:organization_services(name),
        location:business_locations(name)
      `)
      .eq("resource_id", resourceId)
      .eq("status", "confirmed")
      .gte("starts_at", thirtyDaysAgo)
      .lte("starts_at", sixMonthsFuture);

    if (apptError) {
      console.error("Failed to fetch appointments for feed", apptError);
      return new NextResponse("Internal Server Error", {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 5. Generate Calendar — Zero PHI Leakage (No phone numbers, no clinical notes)
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
        description: `Consultation scheduled at ${orgName}.\nView full patient chart in the OmniRelay Clinical Portal.`,
        location: locationName,
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://omnirelay-main.vercel.app'}/app/appointments`,
      });
    }

    const icsString = cal.toString();

    // 6. Return with strictly private, non-cacheable headers
    return new NextResponse(icsString, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="calendar-${resourceId}.ics"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (err) {
    console.error("Calendar feed error:", err);
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
