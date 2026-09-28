import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { KnowledgeWorkspace } from "./knowledge-workspace";
import { PremiumUpsell } from "./premium-upsell";

export default async function AgentsPage() {
  const {supabase,organization}=await getWorkspace();
  if(!organization)redirect("/onboarding");
  const [{data:documents},{data:agents}, {data:orgInfo}]=await Promise.all([
    supabase.from("rag_knowledge_items").select("*").eq("organization_id",organization.id).order("updated_at",{ascending:false}),
    supabase.from("ai_agent_profiles").select("*").eq("organization_id",organization.id).order("created_at"),
    supabase.from("organizations").select("premium_support_agent_active, premium_cto_agent_active, premium_growth_agent_active").eq("id",organization.id).single()
  ]);

  return (
    <div className="space-y-6">
      <PremiumUpsell 
        supportActive={!!orgInfo?.premium_support_agent_active}
        ctoActive={!!orgInfo?.premium_cto_agent_active}
        growthActive={!!orgInfo?.premium_growth_agent_active}
      />
      <KnowledgeWorkspace organizationId={organization.id} documents={documents??[]} agents={agents??[]}/>
    </div>
  );
}
