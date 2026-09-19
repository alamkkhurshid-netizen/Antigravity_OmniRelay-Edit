import { NextResponse } from "next/server";
import { createKnowledgeEmbedding, chunkKnowledge, vectorLiteral } from "@/lib/rag-embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace";

const permittedSources = new Set(["faq", "policy", "service", "business_info"]);

export async function POST() {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const { data: actor } = await supabase.from("agents").select("extra").eq("organization_id", organization.id).eq("user_id", user.id).eq("ai", false).maybeSingle();
  const role = String((actor?.extra as Record<string, unknown> | null)?.role ?? "member");
  if (!actor || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Only a workspace owner or admin can index knowledge." }, { status: 403 });
  }

  const { data: documents, error } = await supabase.from("rag_knowledge_items")
    .select("id,title,content,source_type,updated_at")
    .eq("organization_id", organization.id).eq("status", "approved").limit(50);
  if (error) return NextResponse.json({ error: "Approved knowledge could not be loaded." }, { status: 400 });
  const eligible = (documents ?? []).filter((item) => permittedSources.has(item.source_type));
  if (!eligible.length) return NextResponse.json({ error: "Approve non-clinical FAQs, policies, services or business information before indexing." }, { status: 409 });

  const admin = createAdminClient();
  const completed: string[] = [];
  const failed: string[] = [];
  for (const document of eligible) {
    try {
      const chunks = chunkKnowledge(document.content);
      const { data: existing, error: existingError } = await admin.from("knowledge_chunks")
        .select("id,content").eq("organization_id", organization.id).eq("document_id", document.id);
      if (existingError) throw existingError;
      const existingByContent = new Map((existing ?? []).map((row) => [row.content, row]));
      const changedChunks = chunks.filter((content) => !existingByContent.has(content));
      const removedIds = (existing ?? []).filter((row) => !chunks.includes(row.content)).map((row) => row.id);
      const rows = await Promise.all(changedChunks.map(async (content) => ({
        organization_id: organization.id,
        document_id: document.id,
        content,
        source_updated_at: document.updated_at,
        embedding: vectorLiteral(await createKnowledgeEmbedding(`title: ${document.title} | text: ${content}`, "RETRIEVAL_DOCUMENT")),
      })));
      if (rows.length) {
        const { error: insertError } = await admin.from("knowledge_chunks").insert(rows);
        if (insertError) throw insertError;
      }
      const retainedIds = (existing ?? []).filter((row) => chunks.includes(row.content)).map((row) => row.id);
      if (retainedIds.length) {
        const { error: revisionError } = await admin.from("knowledge_chunks").update({ source_updated_at: document.updated_at }).in("id", retainedIds);
        if (revisionError) throw revisionError;
      }
      if (removedIds.length) {
        const { error: deleteError } = await admin.from("knowledge_chunks").delete().in("id", removedIds);
        if (deleteError) throw deleteError;
      }
      await admin.from("rag_knowledge_items").update({ embedding_status: "indexed", updated_at: new Date().toISOString() }).eq("id", document.id).eq("organization_id", organization.id);
      completed.push(document.id);
    } catch {
      await admin.from("rag_knowledge_items").update({ embedding_status: "failed", updated_at: new Date().toISOString() }).eq("id", document.id).eq("organization_id", organization.id);
      failed.push(document.id);
    }
  }
  return NextResponse.json({ indexed: completed.length, failed: failed.length, total: eligible.length }, { headers: { "Cache-Control": "no-store" } });
}
