import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { AnalyticsWorkspace } from "./analytics-workspace";
import {
  calculateClinicAnalytics,
  buildSanitizedAiPromptPayload,
  RawAppointmentRecord,
  RawQueueEntry,
  RawReminderRecord,
  RawCareTaskRecord,
  DoctorResource,
} from "@/lib/analytics-engine";

export const metadata = {
  title: "Analytics & Value Insights | OmniRelay",
  description:
    "Clinic operational analytics, doctor capacity utilization, queue delay tracking, and AI-powered operations copilot.",
};

export default async function AnalyticsPage() {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organization) {
    redirect("/login");
  }

  // Fetch initial 7d dataset for current organization
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    { data: appointments },
    { data: queueEntries },
    { data: reminders },
    { data: careTasks },
    { data: resources },
    { data: usageEvents },
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
    supabase
      .from("operational_usage_events")
      .select("estimated_total_paise")
      .eq("organization_id", organization.id)
      .eq("channel", "whatsapp")
      .gte("occurred_at", today.toISOString()),
  ]);

  const initialWhatsappCounts = {
    messages: usageEvents?.length || 0,
    estimatedCostPaise: (usageEvents || []).reduce((acc: number, curr: any) => acc + (curr.estimated_total_paise || 0), 0),
  };

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

  const initialAnalytics = calculateClinicAnalytics({
    appointments: rawAppointments,
    queueEntries: rawQueue,
    reminders: rawReminders,
    careTasks: rawTasks,
    resources: doctorResources,
    range: "7d",
    doctorId: "all",
  });

  const initialAiPayload = buildSanitizedAiPromptPayload(
    initialAnalytics,
    organization.name
  );

  return (
    <AnalyticsWorkspace
      initialAnalytics={initialAnalytics}
      initialAiPayload={initialAiPayload}
      clinicName={organization.name}
      doctors={doctorResources}
      organizationId={organization.id}
      initialWhatsappCounts={initialWhatsappCounts}
    />
  );
}
