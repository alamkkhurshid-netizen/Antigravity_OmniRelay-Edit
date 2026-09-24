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
