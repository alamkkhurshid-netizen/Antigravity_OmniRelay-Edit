import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { CareReminderWorkspace } from "./care-reminder-workspace";
import { AutomationControlPanel } from "./automation-control-panel";
import { FollowUpDesk } from "./follow-up-desk";

export default async function AutomationsPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const businessCategory = (organization.extra as Record<string, unknown>)?.business_category;
  if (businessCategory === "Retail & e-commerce") {
    redirect("/app/retail");
  }

  const [{ data: patients }, { data: prescriptions }, { data: reminders }, { data: runs }, { data: templates }, { data: channels }, { data: adherence }, { data: workflows }, { data: automationRuns }, { data: rolloutReadiness }, { data: appointments }, { data: resources }, { data: locations }] =
    await Promise.all([
      supabase
        .from("patient_profiles")
        .select("id,full_name,phone,care_communications_consent")
        .eq("organization_id", organization.id)
        .order("full_name"),
      supabase
        .from("prescriptions")
        .select("id,patient_id,prescription_number,items:prescription_items(id,medicine_name,dosage,frequency,duration,instructions)")
        .eq("organization_id", organization.id)
        .eq("status", "issued")
        .order("issued_at", { ascending: false }),
      supabase
        .from("care_reminders")
        .select("id,patient_id,prescription_id,prescription_item_id,reminder_type,title,instructions,schedule_kind,scheduled_for,time_of_day,starts_on,ends_on,channel,status,consent_snapshot,next_run_at,last_run_at,created_at")
        .eq("organization_id", organization.id)
        .order("next_run_at"),
      supabase
        .from("care_reminder_runs")
        .select("id,reminder_id,patient_id,scheduled_for,channel,status,attempt_count,max_attempts,failure_reason,sent_at,delivered_at,read_at,approved_at,acknowledged_at,acknowledgement,response_kind,response_text,response_received_at,created_at")
        .eq("organization_id", organization.id)
        .order("scheduled_for", { ascending: false })
        .limit(100),
      supabase
        .from("channel_message_templates")
        .select("event_type,provider_template_name,status")
        .eq("organization_id", organization.id)
        .eq("channel", "whatsapp"),
      supabase
        .from("channel_connections")
        .select("channel,status")
        .eq("organization_id", organization.id),
      supabase
        .from("patient_medication_adherence")
        .select("patient_id,total_doses,taken_doses,skipped_doses,snoozed_doses,help_requests,adherence_percent,last_response_at")
        .eq("organization_id", organization.id),
      supabase.from("automation_workflows").select("id,name,trigger_key,status,max_attempts,timeout_seconds,last_run_at,last_success_at,last_failure_at,configuration").eq("organization_id", organization.id).order("created_at"),
      supabase.from("automation_runs").select("id,workflow_id,trigger_key,status,attempt_count,max_attempts,next_attempt_at,started_at,failure_summary,created_at,delivery_status").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(200),
      supabase.rpc("get_automation_rollout_readiness", { p_organization_id: organization.id }),
      supabase.from("appointments").select("id,patient_id,resource_id,location_id,customer_name,starts_at,status,follow_up_at,follow_up_note").eq("organization_id", organization.id).order("starts_at", { ascending: false }),
      supabase.from("booking_resources").select("id,name").eq("organization_id", organization.id).eq("active", true).order("name"),
      supabase.from("business_locations").select("id,name").eq("organization_id", organization.id).eq("active", true).order("name"),
    ]);

  return (
    <><AutomationControlPanel workflows={workflows ?? []} runs={automationRuns ?? []} rolloutReadiness={rolloutReadiness ?? []} nowIso={new Date().toISOString()} /><FollowUpDesk
      organizationId={organization.id}
      patients={patients ?? []}
      prescriptions={prescriptions ?? []}
      appointments={appointments ?? []}
      resources={resources ?? []}
      locations={locations ?? []}
    ><CareReminderWorkspace
      patients={patients ?? []}
      prescriptions={prescriptions ?? []}
      reminders={reminders ?? []}
      runs={runs ?? []}
      templates={templates ?? []}
      channels={channels ?? []}
      adherence={adherence ?? []}
      nowIso={new Date().toISOString()}
    /></FollowUpDesk></>
  );
}
