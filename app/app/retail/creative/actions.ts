"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function generateCreatives(formData: FormData) {
  const supabase = await createClient();
  const productUrl = formData.get("productUrl") as string;
  
  if (!productUrl) {
    return { error: "Product URL is required" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  const { data: profile } = await supabase
    .from("onboarding_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
    
  if (!profile?.organization_id) throw new Error("No organization found");

  const orgId = profile.organization_id;

  // 1. Define the 4 creative angles
  const angles = [
    { angle: "pain", engine: "topview" as const },
    { angle: "social_proof", engine: "topview" as const },
    { angle: "us_vs_them", engine: "topview" as const },
    { angle: "curiosity", engine: "higgsfield" as const },
  ];

  // 2. Insert placeholders into the database (status: rendering)
  const insertData = angles.map(a => ({
    organization_id: orgId,
    product_url: productUrl,
    angle: a.angle,
    hook_script: null, // Will be filled by the AI
    engine: a.engine,
    video_url: null,   // null = rendering in progress
    status: "generating_script"
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

  // 3. Trigger real generation pipeline asynchronously
  triggerCreativeGeneration(insertedRecords, orgId, productUrl);

  return { success: true };
}

// Real creative generation pipeline
async function triggerCreativeGeneration(records: any[], orgId: string, productUrl: string) {
  const supabase = await createClient();
  
  // Step 1: Generate hook scripts via Hermes Agent (or direct LLM call)
  const hermesUrl = process.env.HERMES_AGENT_URL || "http://localhost:8000/api/v1/agent/invoke";
  
  for (const record of records) {
    try {
      // Ask the AI to generate a hook script for this specific angle
      const scriptResponse = await fetch(hermesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "system",
          session_id: `${orgId}-creative-${record.id}`,
          message: `Generate a compelling 15-second video ad hook script for the "${record.angle}" angle. The product URL is: ${productUrl}. Return ONLY the script text, no explanation.`,
          context: {
            workspace_id: orgId,
            payload_type: "creative_script_generation"
          }
        })
      });

      let hookScript = `[Script generation pending for ${record.angle} angle]`;
      if (scriptResponse.ok) {
        const result = await scriptResponse.json();
        hookScript = result.response || result.message || hookScript;
      }

      // Update the record with the generated script
      await supabase
        .from("retail_creatives")
        .update({ hook_script: hookScript, status: "rendering_video" })
        .eq("id", record.id);

      // Step 2: Send to Topview/Higgsfield for video rendering
      if (record.engine === "topview") {
        await triggerTopviewRendering(record.id, productUrl, hookScript, orgId);
      } else {
        await triggerHiggsfieldRendering(record.id, productUrl, hookScript, orgId);
      }
    } catch (err) {
      console.error(`[Creative Pipeline] Failed for record ${record.id}:`, err);
      await supabase
        .from("retail_creatives")
        .update({ status: "failed" })
        .eq("id", record.id);
    }
  }
}

async function triggerTopviewRendering(recordId: string, productUrl: string, script: string, orgId: string) {
  const apiKey = process.env.TOPVIEW_API_KEY;
  if (!apiKey) {
    console.error("[Topview] API key not configured. Set TOPVIEW_API_KEY env var.");
    const supabase = await createClient();
    await supabase.from("retail_creatives").update({ status: "failed" }).eq("id", recordId);
    return;
  }

  try {
    const response = await fetch("https://api.topview.ai/v1/videos", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product_url: productUrl,
        script: script,
        callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/creative/webhook?record_id=${recordId}`
      })
    });

    if (!response.ok) {
      console.error("[Topview] API Error:", await response.text());
      const supabase = await createClient();
      await supabase.from("retail_creatives").update({ status: "failed" }).eq("id", recordId);
    }
    // On success, Topview will call our webhook with the video URL when rendering is complete
  } catch (err) {
    console.error("[Topview] Network Error:", err);
    const supabase = await createClient();
    await supabase.from("retail_creatives").update({ status: "failed" }).eq("id", recordId);
  }
}

async function triggerHiggsfieldRendering(recordId: string, productUrl: string, script: string, orgId: string) {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) {
    console.error("[Higgsfield] API key not configured. Set HIGGSFIELD_API_KEY env var.");
    const supabase = await createClient();
    await supabase.from("retail_creatives").update({ status: "failed" }).eq("id", recordId);
    return;
  }

  try {
    const response = await fetch("https://api.higgsfield.ai/v1/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product_url: productUrl,
        script: script,
        style: "ugc_talking_head",
        callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/creative/webhook?record_id=${recordId}`
      })
    });

    if (!response.ok) {
      console.error("[Higgsfield] API Error:", await response.text());
      const supabase = await createClient();
      await supabase.from("retail_creatives").update({ status: "failed" }).eq("id", recordId);
    }
  } catch (err) {
    console.error("[Higgsfield] Network Error:", err);
    const supabase = await createClient();
    await supabase.from("retail_creatives").update({ status: "failed" }).eq("id", recordId);
  }
}
