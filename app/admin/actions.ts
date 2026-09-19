"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleOrganizationTier(organizationId: string, currentTier: string) {
  const supabase = await createClient();
  
  // Verify caller is an OEM admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  const { data: isOperator } = await supabase.rpc("is_platform_operator", { required_role: "oem_admin" });
  if (!isOperator) throw new Error("Forbidden: OEM Admin access required");

  const newTier = currentTier === "premium" ? "standard" : "premium";

  const { error } = await supabase
    .from("organizations")
    .update({ subscription_tier: newTier })
    .eq("id", organizationId);

  if (error) {
    console.error("Failed to update tier:", error);
    return { success: false, error: "Database update failed" };
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function toggleOrganizationDemoStatus(organizationId: string, currentStatus: boolean) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  const { data: isOperator } = await supabase.rpc("is_platform_operator", { required_role: "oem_admin" });
  if (!isOperator) throw new Error("Forbidden: OEM Admin access required");

  const { error } = await supabase
    .from("organizations")
    .update({ is_demo: !currentStatus })
    .eq("id", organizationId);

  if (error) {
    console.error("Failed to update demo status:", error);
    return { success: false, error: "Database update failed" };
  }

  revalidatePath("/admin");
  return { success: true };
}

export async function resolveOemDraft(draftId: string, action: 'approve' | 'reject') {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: isOperator } = await supabase.rpc("is_platform_operator", { required_role: "oem_admin" });
  if (!isOperator) throw new Error("Forbidden: OEM Admin access required");

  // Fetch the draft
  const { data: draft, error: fetchError } = await supabase
    .from("oem_agent_drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (fetchError || !draft) {
    return { success: false, error: "Draft not found" };
  }

  if (action === "reject") {
    await supabase
      .from("oem_agent_drafts")
      .update({ status: "rejected" })
      .eq("id", draftId);
    
    revalidatePath("/admin");
    return { success: true };
  }

  // Handle Approvals
  if (action === "approve") {
    if (draft.proposed_action === "send_whatsapp_message") {
      const payload = draft.draft_payload;
      const targetOrgId = payload.target_organization_id;
      const messageText = payload.message_text;

      // In a real production scenario, we'd fetch the OEM's WhatsApp API credentials
      // and send the message to the tenant's registered phone number.
      // For this implementation, we simulate the send and mark it approved.
      console.log(`[OEM Autopilot] Sent WhatsApp to Org ${targetOrgId}: ${messageText}`);
      
      // Update draft status
      await supabase
        .from("oem_agent_drafts")
        .update({ status: "approved" })
        .eq("id", draftId);
    }
  }

  revalidatePath("/admin");
  return { success: true };
}
