import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/api-response";

const validSources = new Set(["faq", "policy", "service", "business_info"]);

export async function GET() {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError("Sign in required", 401);
    if (!organization) return apiError("Workspace not found", 409);

    const { data: items, error } = await supabase
      .from("rag_knowledge_items")
      .select("id, title, content, source_type, status, embedding_status, updated_at, created_at")
      .eq("organization_id", organization.id)
      .order("updated_at", { ascending: false });

    if (error) return apiError(error.message, 400);

    return apiSuccess({ items: items ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load knowledge items";
    return apiError(message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError("Sign in required", 401);
    if (!organization) return apiError("Workspace not found", 409);

    const body = await request.json().catch(() => ({}));
    const { title, content, source_type } = body;

    if (!title || typeof title !== "string" || title.trim().length < 2 || title.trim().length > 160) {
      return apiError("Title must be between 2 and 160 characters", 400);
    }
    if (!content || typeof content !== "string" || content.trim().length < 10 || content.trim().length > 20000) {
      return apiError("Content must be between 10 and 20,000 characters", 400);
    }
    if (!source_type || !validSources.has(source_type)) {
      return apiError("source_type must be one of: faq, policy, service, business_info", 400);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("rag_knowledge_items")
      .insert({
        organization_id: organization.id,
        created_by: user.id,
        title: title.trim(),
        content: content.trim(),
        source_type,
        status: "approved",
        embedding_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return apiError(error.message, 400);

    return apiSuccess({ item: data }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save knowledge item";
    return apiError(message, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError("Sign in required", 401);
    if (!organization) return apiError("Workspace not found", 409);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return apiError("Item id required", 400);

    const admin = createAdminClient();
    // Delete associated vector chunks first
    await admin.from("knowledge_chunks").delete().eq("organization_id", organization.id).eq("document_id", id);
    
    // Delete knowledge item
    const { error } = await admin
      .from("rag_knowledge_items")
      .delete()
      .eq("organization_id", organization.id)
      .eq("id", id);

    if (error) return apiError(error.message, 400);

    return apiSuccess({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete knowledge item";
    return apiError(message, 500);
  }
}
