import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { AppointmentManager } from "./appointment-manager";
import { ReceptionBoard } from "./reception-board";

export default async function AppointmentsPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const [{ data: locations }, { data: services }, { data: resources }, { data: appointments }, { data: availability }, { data: bookingPage }, { count: reminderCount }, { data: exceptions }, { data: reminders }, { data: whatsappConnection }, {data:queueEntries}, {data:providerDepartments}] = await Promise.all([
    supabase.from("business_locations").select("id,name,location_type,address,phone").eq("organization_id", organization.id),
    supabase.from("organization_services").select("id,name,duration_minutes,buffer_minutes,price_paise,booking_enabled").eq("organization_id", organization.id),
    supabase.from("booking_resources").select("id,name,resource_type,timezone").eq("organization_id", organization.id).eq("active", true),
    supabase.from("appointments").select("id,patient_id,resource_id,location_id,service_id,customer_name,customer_phone,customer_email,starts_at,ends_at,status,source,notes,payment_status,follow_up_at,follow_up_note,resource:booking_resources(name),location:business_locations(name),service:organization_services(name,duration_minutes),payment:booking_payments(payment_mode,amount_paise,status)").eq("organization_id", organization.id).order("starts_at"),
    supabase.from("availability_rules").select("id,resource_id,location_id,weekday,start_time,end_time,slot_interval_minutes,active").eq("organization_id", organization.id).eq("active", true),
    supabase.from("booking_pages").select("slug,active").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("reminder_events").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "scheduled"),
    supabase.from("schedule_exceptions").select("id,resource_id,location_id,starts_at,ends_at,exception_type,reason,status,created_at").eq("organization_id", organization.id).order("starts_at", { ascending: false }),
    supabase.from("reminder_events").select("id,appointment_id,event_type,scheduled_for,channel,status,attempts,next_attempt_at,failure_reason,sent_at,delivered_at,read_at,appointment:appointments(customer_name,starts_at)").eq("organization_id", organization.id).order("scheduled_for", { ascending: false }).limit(30),
    supabase.from("channel_connections").select("display_address,status").eq("organization_id",organization.id).eq("channel","whatsapp").eq("status","live").maybeSingle(),
    supabase.from("appointment_queue_entries").select("appointment_id,resource_id,location_id,queue_date,token_number,queue_status").eq("organization_id",organization.id).order("token_number"),
    supabase.from("provider_departments").select("resource_id,department_id").eq("organization_id",organization.id),
  ]);
  // The server timestamp keeps the first render deterministic for the client calendar.
  const nowIso = new Date().toISOString();
  return <><ReceptionBoard organizationId={organization.id} appointments={appointments ?? []} resources={resources ?? []} locations={locations ?? []} queueEntries={queueEntries ?? []} nowIso={nowIso}/><AppointmentManager organizationId={organization.id} organizationName={organization.name} businessCategory={organization.category ?? "Clinic"} locations={locations ?? []} services={(services ?? []).filter((service) => service.booking_enabled)} resources={resources ?? []} appointments={appointments ?? []} availability={availability ?? []} exceptions={exceptions ?? []} reminders={reminders ?? []} bookingSlug={bookingPage?.active ? bookingPage.slug : ""} whatsappNumber={whatsappConnection?.display_address??""} reminderCount={reminderCount ?? 0} nowIso={nowIso} providerDepartments={providerDepartments??[]} /></>;
}
