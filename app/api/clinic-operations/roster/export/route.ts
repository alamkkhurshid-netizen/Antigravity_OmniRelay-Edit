import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import {
  buildDailyRosterData,
  generateDailyRosterCsv,
  formatKolkataDate,
} from "@/lib/daily-roster";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get("date") || formatKolkataDate(new Date());
  const doctorId = searchParams.get("doctorId") || undefined;
  const format = searchParams.get("format") || "csv";

  if (!datePattern.test(requestedDate)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
  }

  // Calculate day boundary in Asia/Kolkata
  const dayStart = new Date(`${requestedDate}T00:00:00+05:30`).toISOString();
  const dayEnd = new Date(
    new Date(`${requestedDate}T00:00:00+05:30`).getTime() + 86400000
  ).toISOString();

  // Fetch all necessary clinic records for this date in parallel
  const [
    { data: appointments, error: appError },
    { data: resources },
    { data: locations },
    { data: queueEntries },
    { data: providerProfiles },
  ] = await Promise.all([
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

  const rosterData = buildDailyRosterData({
    organizationName: organization.name || "OmniRelay Clinic",
    date: requestedDate,
    appointments: appointments || [],
    resources: resources || [],
    locations: locations || [],
    queueEntries: queueEntries || [],
    providerProfiles: providerProfiles || [],
  });

  if (format === "json") {
    return NextResponse.json({ roster: rosterData });
  }

  const csvContent = generateDailyRosterCsv(rosterData, doctorId);
  const sanitizedOrgName = (organization.name || "clinic").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const filename = `${sanitizedOrgName}-daily-roster-${requestedDate}${doctorId ? "-doctor" : ""}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
