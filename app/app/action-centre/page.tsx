import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { isoBeforeNow, isoNow } from "@/lib/time";
import { ActionCentreWorkspace } from "./workspace";

export default async function ActionCentrePage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const { data: { user } } = await supabase.auth.getUser();
  const { data: actor } = user ? await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).maybeSingle() : { data: null };
  const canManageNotifications = ["owner", "admin"].includes(String((actor?.extra as Record<string, unknown> | null)?.role ?? "member"));
  const since = isoBeforeNow(30 * 24 * 60 * 60 * 1000);

  const [{ data: careRuns }, { data: appointmentRuns }, { data: tasks }, { data: deployments }, { data: bookingRequests }, {data:waitlist}, {data:disruptions}, {data:emergencyRecipients}, {data:assignments}, {data:readinessChecks}, {data:pilotControl}] = await Promise.all([
    supabase.from("care_reminder_runs")
      .select("id,status,scheduled_for,attempt_count,max_attempts,failure_reason,channel,patient:patient_profiles(full_name,phone,care_communications_consent),reminder:care_reminders(title,reminder_type,approval_mode)")
      .eq("organization_id", organization.id).gte("scheduled_for", since).order("scheduled_for", { ascending: false }).limit(300),
    supabase.from("reminder_events")
      .select("id,event_type,status,scheduled_for,attempts,max_attempts,failure_reason,appointment:appointments(customer_name,customer_phone,care_communications_consent)")
      .eq("organization_id", organization.id).gte("scheduled_for", since).order("scheduled_for", { ascending: false }).limit(300),
    supabase.from("patient_care_tasks")
      .select("id,title,details,due_at,priority,status,patient:patient_profiles(full_name)")
      .eq("organization_id", organization.id).in("status", ["open", "in_progress"]).order("due_at", { ascending: true, nullsFirst: false }).limit(100),
    supabase.from("action_centre_deployments")
      .select("id,status,deployed_count,automatic_count,exception_count,created_at")
      .eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("whatsapp_booking_requests")
      .select("id,patient_name,starts_at,status,service:organization_services(name),location:business_locations(name),resource:booking_resources(name)")
      .eq("organization_id", organization.id).eq("status", "pending_approval").order("created_at", { ascending: true }).limit(100),
    supabase.from("appointment_waitlist").select("id,patient_name,preferred_date,status,priority,service:organization_services(name),location:business_locations(name),resource:booking_resources(name)").eq("organization_id",organization.id).in("status",["waiting","offered"]).order("priority",{ascending:false}).limit(100),
    supabase.from("schedule_exceptions").select("id,starts_at,ends_at,exception_type,reason,status,resource:booking_resources(name),location:business_locations(name)").eq("organization_id",organization.id).eq("status","active").gte("ends_at",new Date().toISOString()).order("starts_at").limit(100),
    supabase.from("campaign_recipients").select("id,status,failure_reason,patient:patient_profiles(full_name),campaign:campaigns!inner(campaign_type,status)").eq("organization_id",organization.id).in("status",["failed","skipped","opted_out"]).eq("campaign.campaign_type","emergency").limit(100),
    supabase.from("action_centre_assignments").select("item_kind,subject_id,assigned_to,status,updated_at").eq("organization_id",organization.id).neq("status","released"),
    supabase.from("production_readiness_checks").select("id,check_key,status,notes,updated_at").eq("organization_id", organization.id).eq("status", "blocked").order("updated_at", { ascending: false }).limit(20),
    supabase.from("clinic_pilot_controls").select("pilot_owner_name,rollback_owner_name,planned_start_date,health_status,health_note,reviewed_at").eq("organization_id", organization.id).maybeSingle(),
  ]);

  return <ActionCentreWorkspace careRuns={careRuns ?? []} appointmentRuns={appointmentRuns ?? []} tasks={tasks ?? []} deployments={deployments ?? []} bookingRequests={bookingRequests ?? []} waitlist={waitlist??[]} disruptions={disruptions??[]} emergencyRecipients={emergencyRecipients??[]} assignments={assignments??[]} readinessChecks={readinessChecks??[]} pilotControl={pilotControl} currentUserId={user?.id??""} canManageNotifications={canManageNotifications} nowIso={isoNow()} />;
}
