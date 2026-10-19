import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { KnowledgeWorkspace, KnowledgeItem } from "./knowledge-workspace";

export const metadata = {
  title: "Knowledge Base — OmniRelay",
  description: "Manage clinic facts, FAQs, and policies that power the WhatsApp AI Concierge.",
};

export default async function KnowledgePage() {
  const { supabase, organization } = await getWorkspace();
  if (!organization) redirect("/onboarding");

  const { data: items } = await supabase
    .from("rag_knowledge_items")
    .select("id, title, content, source_type, status, embedding_status, updated_at, created_at")
    .eq("organization_id", organization.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-8 p-6 lg:p-10 max-w-7xl mx-auto">
      <PageHeader
        title="Knowledge Base & AI RAG"
        description="Provide verified facts, clinic timings, fees, and guidelines. The WhatsApp AI Concierge cites these documents to answer patient questions instantly."
      />

      <KnowledgeWorkspace
        initialItems={(items ?? []) as KnowledgeItem[]}
        organizationName={organization.name || "Clinic"}
      />
    </div>
  );
}
