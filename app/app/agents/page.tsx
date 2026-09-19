import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { KnowledgeWorkspace } from "./knowledge-workspace";

export default async function AgentsPage() {
  const {supabase,organization}=await getWorkspace();
  if(!organization)redirect("/onboarding");
  const [{data:documents},{data:agents}]=await Promise.all([
    supabase.from("rag_knowledge_items").select("*").eq("organization_id",organization.id).order("updated_at",{ascending:false}),
    supabase.from("ai_agent_profiles").select("*").eq("organization_id",organization.id).order("created_at"),
  ]);
  return <KnowledgeWorkspace organizationId={organization.id} documents={documents??[]} agents={agents??[]}/>;
}
