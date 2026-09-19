"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function scheduleContent(date: string, format: string, goal: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase.from('user_profiles').select('active_organization_id').eq('id', user.id).single();
  if (!profile?.active_organization_id) throw new Error("No organization");

  const { error } = await supabase.from('retail_content_calendar').insert({
    organization_id: profile.active_organization_id,
    post_date: date,
    content_format: format,
    strategic_goal: goal,
    status: 'scheduled'
  });

  if (error) {
    console.error("Failed to schedule:", error);
    return { success: false, error: "Failed to schedule content." };
  }

  revalidatePath("/app/retail/calendar");
  return { success: true };
}

export async function deployContent(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // In a real app, this would hit the Meta Graph API to actually publish to IG/FB
  console.log(`[Deploying Content] Executing API call to Meta Graph for post ID: ${id}`);

  const { error } = await supabase
    .from('retail_content_calendar')
    .update({ status: 'published' })
    .eq('id', id);

  if (error) {
    console.error("Failed to deploy:", error);
    return { success: false, error: "Failed to deploy content." };
  }

  revalidatePath("/app/retail/calendar");
  return { success: true };
}
