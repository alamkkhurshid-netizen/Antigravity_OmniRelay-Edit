"use server"

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleGoogleCalendarSync(organizationId: string, enabled: boolean) {
  const supabase = await createClient();
  
  const { data: org } = await supabase
    .from("organizations")
    .select("extra")
    .eq("id", organizationId)
    .single();
    
  if (!org) return { error: "Organization not found" };

  const extra = (org.extra || {}) as Record<string, any>;
  const features = extra.features || {};
  features.google_calendar_sync = enabled;

  const { error } = await supabase
    .from("organizations")
    .update({ extra: { ...extra, features } })
    .eq("id", organizationId);

  if (error) return { error: error.message };
  
  revalidatePath("/oem/tenants");
  return { success: true };
}

export async function togglePremiumAgent(organizationId: string, agentType: 'support' | 'growth' | 'cto' | 'admin', enabled: boolean) {
  const supabase = await createClient();
  
  const columnMap = {
    'support': 'premium_support_agent_active',
    'growth': 'premium_growth_agent_active',
    'cto': 'premium_cto_agent_active',
    'admin': 'premium_admin_agent_active'
  };

  const updatePayload = { [columnMap[agentType]]: enabled };

  const { error } = await supabase
    .from("organizations")
    .update(updatePayload)
    .eq("id", organizationId);

  if (error) return { error: error.message };
  
  revalidatePath("/oem/tenants");
  return { success: true };
}
