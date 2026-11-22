import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { CampaignWorkspace } from "./campaign-workspace";
import { STANDARD_TEMPLATES } from "@/app/api/integrations/templates/route";

export default async function CampaignsPage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");
  const [{data:patients},{data:campaigns},{data:templates},{data:locations},{data:resources},{data:appointments},{data:optOuts}]=await Promise.all([
    supabase.from("patient_profiles").select("id,full_name,phone,health_concern,care_communications_consent,marketing_consent").eq("organization_id",organization.id).order("full_name"),
    supabase.from("campaigns").select("id,name,campaign_type,status,scheduled_for,eligible_count,sent_count,delivered_count,read_count,failed_count,skipped_count").eq("organization_id",organization.id).order("created_at",{ascending:false}),
    supabase.from("channel_message_templates").select("id,event_type,provider_template_name,language_code,status").eq("organization_id",organization.id).in("event_type",["care_campaign","marketing_campaign","emergency_notice"]),
    supabase.from("business_locations").select("id,name").eq("organization_id",organization.id).order("name"),
    supabase.from("booking_resources").select("id,name").eq("organization_id",organization.id).eq("active",true).order("name"),
    supabase.from("appointments").select("patient_id,location_id,resource_id,service_name,starts_at,status").eq("organization_id",organization.id),
    supabase.from("communication_opt_outs").select("address,scope").eq("organization_id",organization.id).eq("channel","whatsapp"),
  ]);

  let templateList = templates ?? [];
  const campaignSpecs = STANDARD_TEMPLATES.filter((s) =>
    ["care_campaign", "marketing_campaign", "emergency_notice"].includes(s.event_type)
  );

  const missingSpecs = campaignSpecs.filter(
    (spec) => !templateList.some((t) => t.event_type === spec.event_type)
  );

  if (missingSpecs.length > 0) {
    const seedRows = missingSpecs.map((s) => ({
      organization_id: organization.id,
      channel: "whatsapp",
      event_type: s.event_type,
      provider_template_name: s.provider_template_name,
      language_code: s.language_code,
      status: "approved",
      variable_map: s.variable_map,
    }));
    await supabase.from("channel_message_templates").upsert(seedRows, {
      onConflict: "organization_id,channel,event_type,language_code",
    });
    const { data: refreshed } = await supabase
      .from("channel_message_templates")
      .select("id,event_type,provider_template_name,language_code,status")
      .eq("organization_id", organization.id)
      .in("event_type", ["care_campaign", "marketing_campaign", "emergency_notice"]);
    if (refreshed && refreshed.length > 0) {
      templateList = refreshed;
    }
  }

  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-sm font-medium">Loading campaign workspace...</div>}>
      <CampaignWorkspace
        organizationName={organization.name || "Neoclinic"}
        patients={patients??[]}
        campaigns={campaigns??[]}
        templates={templateList}
        locations={locations??[]}
        resources={resources??[]}
        appointments={appointments??[]}
        optOuts={optOuts??[]}
      />
    </Suspense>
  );
}
