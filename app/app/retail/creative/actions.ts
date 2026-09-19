"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function generateCreatives(formData: FormData) {
  const supabase = await createClient();
  const productUrl = formData.get("productUrl") as string;
  
  if (!productUrl) {
    return { error: "Product URL is required" };
  }

  // Get current user's organization
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  const { data: profile } = await supabase
    .from("onboarding_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
    
  if (!profile?.organization_id) throw new Error("No organization found");

  const orgId = profile.organization_id;

  // 1. Simulate scraping & LLM generation (The 4 Angles)
  // In a real app, this is where we call OpenAI/Anthropic.
  const angles = [
    {
      angle: "pain",
      hook_script: "Tired of dealing with [Problem]? It's time to stop settling.",
      engine: "topview"
    },
    {
      angle: "social_proof",
      hook_script: "I honestly didn't believe the hype until I tried it myself. Look at these results!",
      engine: "topview"
    },
    {
      angle: "us_vs_them",
      hook_script: "Stop using the old way. Here is why everyone is switching to this.",
      engine: "topview"
    },
    {
      angle: "curiosity",
      hook_script: "This one weird trick is completely changing how people do X.",
      engine: "higgsfield"
    }
  ];

  // 2. Insert placeholders into the database
  const insertData = angles.map(a => ({
    organization_id: orgId,
    product_url: productUrl,
    angle: a.angle,
    hook_script: a.hook_script,
    engine: a.engine,
    video_url: null // null indicates it is rendering
  }));

  const { data: insertedRecords, error } = await supabase
    .from("retail_creatives")
    .insert(insertData)
    .select();

  if (error) {
    console.error("Insert error:", error);
    return { error: "Failed to initialize creative rendering" };
  }

  revalidatePath("/app/retail/creative");

  // 3. Simulate asynchronous video rendering (Topview/Higgsfield API call)
  // We trigger this without awaiting it so the user's UI responds immediately.
  simulateVideoRendering(insertedRecords, orgId);

  return { success: true };
}

// Background simulation of API webhooks
async function simulateVideoRendering(records: any[], orgId: string) {
  const supabase = await createClient(); // Need a fresh client for the background task
  
  // Wait 5 seconds to simulate rendering time
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Dummy video URLs for demonstration
  const topviewVideo = "https://www.w3schools.com/html/mov_bbb.mp4"; // generic placeholder
  const higgsfieldVideo = "https://www.w3schools.com/html/mov_bbb.mp4"; 
  
  for (const record of records) {
    const videoUrl = record.engine === 'topview' ? topviewVideo : higgsfieldVideo;
    
    await supabase
      .from("retail_creatives")
      .update({ video_url: videoUrl })
      .eq("id", record.id);
  }
}
