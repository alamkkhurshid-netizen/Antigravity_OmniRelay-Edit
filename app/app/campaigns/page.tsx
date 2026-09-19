import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { CampaignWorkspace } from "./campaign-workspace";

export default async function CampaignsPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const [{data:patients},{data:campaigns},{data:templates},{data:locations},{data:resources},{data:appointments},{data:optOuts}]=await Promise.all([
    supabase.from("patient_profiles").select("id,full_name,phone,health_concern,care_communications_consent,marketing_consent").eq("organization_id",organization.id).order("full_name"),
    supabase.from("campaigns").select("id,name,campaign_type,status,scheduled_for,eligible_count,sent_count,delivered_count,read_count,failed_count,skipped_count").eq("organization_id",organization.id).order("created_at",{ascending:false}),
    supabase.from("channel_message_templates").select("id,event_type,provider_template_name,language_code,status").eq("organization_id",organization.id).in("event_type",["care_campaign","marketing_campaign","emergency_notice"]),
    supabase.from("business_locations").select("id,name").eq("organization_id",organization.id).order("name"),
    supabase.from("booking_resources").select("id,name").eq("organization_id",organization.id).eq("active",true).order("name"),
    supabase.from("appointments").select("patient_id,location_id,resource_id,starts_at,status").eq("organization_id",organization.id),
    supabase.from("communication_opt_outs").select("address,scope").eq("organization_id",organization.id).eq("channel","whatsapp"),
  ]);
  return <CampaignWorkspace patients={patients??[]} campaigns={campaigns??[]} templates={templates??[]} locations={locations??[]} resources={resources??[]} appointments={appointments??[]} optOuts={optOuts??[]}/>;
}
