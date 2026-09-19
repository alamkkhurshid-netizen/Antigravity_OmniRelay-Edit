import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import {
  calculateClinicAnalytics,
  generateAnalyticsCsv,
  buildSanitizedAiPromptPayload,
  DateRangeKey,
  RawAppointmentRecord,
  RawQueueEntry,
  RawReminderRecord,
  RawCareTaskRecord,
  DoctorResource,
} from "@/lib/analytics-engine";

export async function GET(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organization) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rangeParam = (searchParams.get("range") || "7d") as DateRangeKey;
  const validRanges: DateRangeKey[] = ["today", "7d", "30d", "month"];
  const range = validRanges.includes(rangeParam) ? rangeParam : "7d";
  const doctorId = searchParams.get("doctorId") || "all";
  const format = searchParams.get("format") || "json";

  // Scoped strictly to current organization (RLS boundary)
  const [
    { data: appointments },
    { data: queueEntries },
    { data: reminders },
    { data: careTasks },
    { data: resources },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("id,patient_id,location_id,resource_id,starts_at,status,service_id,payment:appointment_payments(payment_mode,amount_paise,status)")
      .eq("organization_id", organization.id)
      .order("starts_at", { ascending: false }),
    supabase
      .from("patient_queue")
      .select("appointment_id,token_number,queue_status,arrived_at,called_at,completed_at")
      .eq("organization_id", organization.id),
    supabase
      .from("appointment_reminders")
      .select("id,appointment_id,status,scheduled_for,sent_at")
      .eq("organization_id", organization.id),
    supabase
      .from("patient_care_tasks")
      .select("id,appointment_id,status,priority,due_at")
      .eq("organization_id", organization.id),
    supabase
      .from("resources")
      .select("id,name,location_id")
      .eq("organization_id", organization.id),
  ]);

  // Transform raw data safely
  const rawAppointments: RawAppointmentRecord[] = (appointments || []).map((a: any) => ({
    id: a.id,
    patient_id: a.patient_id,
    location_id: a.location_id,
    resource_id: a.resource_id,
    starts_at: a.starts_at,
    status: a.status,
    service_id: a.service_id,
    payment: Array.isArray(a.payment) && a.payment.length > 0 ? a.payment[0] : a.payment || null,
  }));

  const rawQueue: RawQueueEntry[] = (queueEntries || []).map((q: any) => ({
    appointment_id: q.appointment_id,
    token_number: q.token_number,
    queue_status: q.queue_status,
    arrived_at: q.arrived_at,
    called_at: q.called_at,
    completed_at: q.completed_at,
  }));

  const rawReminders: RawReminderRecord[] = (reminders || []).map((r: any) => ({
    id: r.id,
    appointment_id: r.appointment_id,
    status: r.status,
    scheduled_for: r.scheduled_for,
    sent_at: r.sent_at,
  }));

  const rawTasks: RawCareTaskRecord[] = (careTasks || []).map((t: any) => ({
    id: t.id,
    appointment_id: t.appointment_id,
    status: t.status,
    priority: t.priority,
    due_at: t.due_at,
  }));

  const doctorResources: DoctorResource[] = (resources || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    location_id: r.location_id,
  }));

  const analytics = calculateClinicAnalytics({
    appointments: rawAppointments,
    queueEntries: rawQueue,
    reminders: rawReminders,
    careTasks: rawTasks,
    resources: doctorResources,
    range,
    doctorId,
  });

  // Handle CSV Download request
  if (format === "csv") {
    const csvContent = generateAnalyticsCsv(analytics, organization.name);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `clinic-analytics-${range}-${dateStr}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const sanitizedAiPayload = buildSanitizedAiPromptPayload(analytics, organization.name);

  return NextResponse.json({
    analytics,
    sanitizedAiPayload,
    organizationName: organization.name,
    doctors: doctorResources,
  });
}
