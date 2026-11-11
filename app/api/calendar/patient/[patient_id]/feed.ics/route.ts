import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import ical from "ical-generator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ patient_id: string }> }
) {
  try {
    const { patient_id } = await params;
    const patientId = patient_id;
    if (!patientId) {
      return new NextResponse("Not Found", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 1. Strict Authentication: Patient calendar feed requires an authenticated session
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized: Authentication required to access patient calendar feeds.", {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 2. Fetch Patient details (enforcing RLS)
    const { data: patient, error: patientError } = await supabase
      .from("patient_profiles")
      .select("id, full_name, organization_id, organization:organizations(name)")
      .eq("id", patientId)
      .maybeSingle();

    if (patientError || !patient) {
      return new NextResponse("Patient calendar not found or access denied.", {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 3. Strict Authorization: User must be an authenticated member of this clinic organization
    const { data: isMember } = await supabase.rpc("is_organization_member", {
      target_organization_id: patient.organization_id,
      minimum_role: "member",
    });

    if (!isMember) {
      return new NextResponse("Forbidden: Access denied to this patient calendar feed.", {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    const org = Array.isArray(patient.organization) ? patient.organization[0] : patient.organization;
    const orgName = org?.name || "OmniRelay Clinic";

    // 4. Fetch Appointments (Scoped by RLS, bounded window)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oneYearFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const { data: appointments, error: apptError } = await supabase
      .from("appointments")
      .select(`
        id, starts_at, ends_at,
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
      return new NextResponse("Internal Server Error", {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 5. Generate Calendar — Zero PHI Leakage (No clinical notes, private details)
    const cal = ical({
      name: `Appointments - ${orgName}`,
      timezone: "Asia/Kolkata",
    });

    for (const appt of appointments || []) {
      const startTime = new Date(appt.starts_at);
      const endTime = appt.ends_at ? new Date(appt.ends_at) : new Date(startTime.getTime() + 30 * 60000);
      
      const srv = Array.isArray(appt.service) ? appt.service[0] : appt.service;
      const serviceName = srv?.name || "Consultation";
      
      const loc = Array.isArray(appt.location) ? appt.location[0] : appt.location;
      const locationName = loc?.name || orgName;
      const locationAddress = (loc as { address?: string } | null)?.address || "";

      const doc = Array.isArray(appt.resource) ? appt.resource[0] : appt.resource;
      const doctorName = doc?.name || "Doctor";

      cal.createEvent({
        start: startTime,
        end: endTime,
        summary: `[${orgName}] ${serviceName} with ${doctorName}`,
        description: `Scheduled appointment at ${orgName}.\nView details in the patient portal.`,
        location: locationAddress ? `${locationName}, ${locationAddress}` : locationName,
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://omnirelay-main.vercel.app'}/manage`,
      });
    }

    const icsString = cal.toString();

    // 6. Return with strictly private, non-cacheable headers
    return new NextResponse(icsString, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="appointments-${patientId.slice(0, 8)}.ics"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (err) {
    console.error("Patient calendar feed error:", err);
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
