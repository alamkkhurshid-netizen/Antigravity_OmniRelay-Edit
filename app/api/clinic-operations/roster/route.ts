import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
type AvailabilityRecord = {
  id: string;
  resource_id: string;
  start_time: string;
  end_time: string;
  slot_interval_minutes: number;
  resource: {
    name: string;
    active: boolean;
    provider_profiles: {
      specialization: string | null;
      contact_phone: string | null;
      queue_notifications_enabled: boolean;
      whatsapp_queue_consent_at: string | null;
    } | null;
  } | null;
  location: { id: string; name: string } | null;
};
type DispatchRecord = {
  availability_rule_id: string;
  status: string;
  failure_reason: string | null;
  scheduled_for: string;
  updated_at: string;
};
type DepartmentLink = {
  resource_id: string;
  department: { id: string; name: string } | null;
};
type ExceptionRecord = {
  id: string;
  resource_id: string | null;
  location_id: string | null;
  starts_at: string;
  ends_at: string;
  exception_type: string;
  reason: string;
  status: string;
};
export async function GET(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization)
    return NextResponse.json(
      { error: "Workspace not found." },
      { status: 409 },
    );
  const requested =
    new URL(request.url).searchParams.get("date") ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
      new Date(),
    );
  if (!datePattern.test(requested))
    return NextResponse.json(
      { error: "Invalid roster date." },
      { status: 400 },
    );
  const localNoon = new Date(`${requested}T12:00:00+05:30`);
  const weekday = localNoon.getUTCDay();
  const dayStart = new Date(`${requested}T00:00:00+05:30`).toISOString();
  const dayEnd = new Date(
    new Date(`${requested}T00:00:00+05:30`).getTime() + 86400000,
  ).toISOString();
  const [
    { data: rules },
    { data: appointments },
    { data: dispatches },
    { data: departmentLinks },
    { data: exceptions },
  ] = await Promise.all([
    supabase
      .from("availability_rules")
      .select(
        "id,resource_id,location_id,start_time,end_time,slot_interval_minutes,resource:booking_resources(id,name,active,provider_profiles(specialization,contact_phone,queue_notifications_enabled,whatsapp_queue_consent_at)),location:business_locations(id,name)",
      )
      .eq("organization_id", organization.id)
      .eq("weekday", weekday)
      .eq("active", true)
      .or(`effective_from.is.null,effective_from.lte.${requested}`)
      .or(`effective_to.is.null,effective_to.gte.${requested}`)
      .order("start_time"),
    supabase
      .from("appointments")
      .select("id,resource_id,status,starts_at")
      .eq("organization_id", organization.id)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .neq("status", "cancelled"),
    supabase
      .from("doctor_queue_dispatches")
      .select(
        "availability_rule_id,status,failure_reason,scheduled_for,updated_at",
      )
      .eq("organization_id", organization.id)
      .eq("shift_date", requested),
    supabase
      .from("provider_departments")
      .select("resource_id,department:clinic_departments(id,name)")
      .eq("organization_id", organization.id)
      .eq("primary_department", true),
    supabase
      .from("schedule_exceptions")
      .select(
        "id,resource_id,location_id,starts_at,ends_at,exception_type,reason,status",
      )
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .lt("starts_at", dayEnd)
      .gt("ends_at", dayStart),
  ]);
  const typedRules = (rules ?? []) as unknown as AvailabilityRecord[];
  const typedDispatches = (dispatches ?? []) as unknown as DispatchRecord[];
  const typedLinks = (departmentLinks ?? []) as unknown as DepartmentLink[];
  const typedExceptions = (exceptions ?? []) as unknown as ExceptionRecord[];
  const rows = typedRules
    .filter((rule) => rule.resource?.active)
    .map((rule) => {
      const [sh, sm] = String(rule.start_time).split(":").map(Number),
        [eh, em] = String(rule.end_time).split(":").map(Number);
      const shiftStart = new Date(
        `${requested}T${String(rule.start_time).slice(0, 8)}+05:30`,
      ).getTime();
      const shiftEnd = new Date(
        `${requested}T${String(rule.end_time).slice(0, 8)}+05:30`,
      ).getTime();
      const bookings = (appointments ?? []).filter((appointment) => {
        const startsAt = new Date(appointment.starts_at).getTime();
        return (
          appointment.resource_id === rule.resource_id &&
          startsAt >= shiftStart &&
          startsAt < shiftEnd
        );
      });
      const capacity = Math.max(
        0,
        Math.floor(
          (eh * 60 + em - (sh * 60 + sm)) / rule.slot_interval_minutes,
        ),
      );
      const count = (status: string) =>
        bookings.filter((item) => item.status === status).length;
      const profile = rule.resource.provider_profiles;
      const dispatch =
        typedDispatches.find((item) => item.availability_rule_id === rule.id) ??
        null;
      const department =
        typedLinks.find((item) => item.resource_id === rule.resource_id)
          ?.department ?? null;
      const activeExceptions = typedExceptions.filter(
        (item) =>
          (item.resource_id === null ||
            item.resource_id === rule.resource_id) &&
          (item.location_id === null ||
            item.location_id === rule.location?.id) &&
          new Date(item.starts_at).getTime() < shiftEnd &&
          new Date(item.ends_at).getTime() > shiftStart,
      );
      return {
        id: rule.id,
        resourceId: rule.resource_id,
        doctor: rule.resource.name,
        specialization: profile?.specialization ?? "General practice",
        department: department?.name ?? "Unassigned",
        departmentId: department?.id ?? null,
        chamber: rule.location?.name ?? "Clinic",
        startTime: String(rule.start_time).slice(0, 5),
        endTime: String(rule.end_time).slice(0, 5),
        slotMinutes: rule.slot_interval_minutes,
        capacity,
        booked: bookings.length,
        empty: Math.max(0, capacity - bookings.length),
        arrived: count("arrived"),
        waiting: count("arrived"),
        inConsultation: count("in_consultation"),
        completed: count("completed"),
        noShow: count("no_show"),
        doctorPhone: profile?.contact_phone ?? null,
        queueEnabled: Boolean(
          profile?.queue_notifications_enabled &&
          profile?.whatsapp_queue_consent_at,
        ),
        dispatch,
        exceptions: activeExceptions.map((item) => ({
          id: item.id,
          type: item.exception_type,
          reason: item.reason,
          startsAt: item.starts_at,
          endsAt: item.ends_at,
        })),
      };
    });
  const departments = [...new Set(rows.map((row) => row.department))].sort();
  const alerts = rows.flatMap((row) => [
    ...(row.exceptions.length
      ? [
          {
            key: `exception:${row.id}`,
            severity: "critical",
            title: `${row.doctor} schedule exception`,
            detail: row.exceptions[0].reason,
          },
        ]
      : []),
    ...(!row.doctorPhone
      ? [
          {
            key: `phone:${row.resourceId}`,
            severity: "warning",
            title: `${row.doctor} queue unavailable`,
            detail:
              "Add a doctor WhatsApp number before enabling queue alerts.",
          },
        ]
      : []),
    ...(row.dispatch?.status === "failed"
      ? [
          {
            key: `dispatch:${row.id}`,
            severity: "critical",
            title: `${row.doctor} queue delivery failed`,
            detail:
              row.dispatch.failure_reason ??
              "Review WhatsApp delivery operations.",
          },
        ]
      : []),
  ]);
  return NextResponse.json({
    date: requested,
    updatedAt: new Date().toISOString(),
    rows,
    departments,
    alerts,
  });
}
