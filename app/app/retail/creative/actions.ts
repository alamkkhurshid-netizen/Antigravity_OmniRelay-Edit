"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function generateCreatives(formData: FormData) {
  const supabase = await createClient();
  const imageFile = formData.get("productImage") as File;
  
  if (!imageFile || imageFile.size === 0) {
    return { error: "A product image is required" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Upload image to Supabase Storage
  const fileExt = imageFile.name.split('.').pop();
  const fileName = `${user.id}-${Date.now()}.${fileExt}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('creative-assets')
    .upload(fileName, imageFile);

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return { error: "Failed to upload image. Please try again." };
  }

  const { data: { publicUrl } } = supabase.storage
    .from('creative-assets')
    .getPublicUrl(fileName);

  const productUrl = publicUrl;

  // AI Image Quality Verification Gate
  // In the simulation, we'll pass the original filename so we can test the rejection logic
  const verification = await verifyImageQuality(productUrl, imageFile.name);
  if (!verification.passed) {
    // If it fails verification, we optionally could delete the uploaded file here to save space
    return { error: `AI Vision Check Failed: ${verification.reason}` };
  }
  
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

// AI Image Quality Gatekeeper Simulation
async function verifyImageQuality(url: string, originalFilename: string = ""): Promise<{ passed: boolean; reason?: string }> {
  // In production, this would call Gemini Pro Vision or Claude 3.5 Sonnet to analyze the primary image at the URL.
  
  // Simulation logic for UX demonstration:
  // If the user uploads a file with "bad" or "blurry" in the name, we reject it.
  const checkStr = originalFilename.toLowerCase();
  
  if (checkStr.includes("bad") || checkStr.includes("blurry")) {
    return { 
      passed: false, 
      reason: "The photo is too blurry and poorly lit. High-quality rendering requires a clear, professional image. Please retake the photo in good lighting."
    };
  }
  
  // If the user uploads a file with "noproduct", we reject it.
  if (checkStr.includes("noproduct") || checkStr.includes("lifestyle")) {
    return { 
      passed: false, 
      reason: "No distinct product detected. The image appears to be a chaotic lifestyle shot. Please upload a clear photo of the product itself."
    };
  }

  // Otherwise, it passes the AI check.
  return { passed: true };
}

// Real creative generation pipeline
async function triggerCreativeGeneration(records: any[], orgId: string, productUrl: string) {
  const supabase = await createClient();
  
  // Step 1: Fetch latest Trend Intelligence (ScrapeGraphAI data)
  const { data: trendReport } = await supabase
    .from("trend_intelligence_reports")
    .select("report_payload")
    .eq("organization_id", orgId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const scrapedIntelligence = trendReport?.report_payload || null;

  // Step 2: Generate hook scripts via Hermes Agent (or direct LLM call)
  const hermesUrl = process.env.HERMES_AGENT_URL || "http://localhost:8000/api/v1/agent/invoke";
  
  for (const record of records) {
    try {
      let enrichedIntelligence = "High-performing viral hook structure.";
      let visualStyle = "";
      let viralHashtags = "";
      let engagementStrategy = "";
      
      if (scrapedIntelligence) {
        // Use real scraped data
        const hooks = scrapedIntelligence.top_hooks || [];
        enrichedIntelligence = hooks[Math.floor(Math.random() * hooks.length)] || enrichedIntelligence;
        visualStyle = scrapedIntelligence.visual_style ? `Visual Context to aim for: ${scrapedIntelligence.visual_style}` : "";
        
        if (scrapedIntelligence.top_hashtags && scrapedIntelligence.top_hashtags.length > 0) {
          viralHashtags = `Include these trending hashtags in the caption/overlay: ${scrapedIntelligence.top_hashtags.join(", ")}`;
        }
        
        if (scrapedIntelligence.engagement_signals) {
          engagementStrategy = `Engagement Driver: ${scrapedIntelligence.engagement_signals}`;
        }
      } else {
        // Fallback to mock data if they haven't run a scrape yet
        const mockAdLibraryHooks: Record<string, string> = {
          pain: "Tired of X? This product completely solved it for me.",
          social_proof: "TikTok made me buy it and it actually works! Over 10k 5-star reviews.",
          us_vs_them: "Stop buying expensive X. This does the exact same thing for half the price.",
          curiosity: "I can't believe no one is talking about this hidden feature..."
        };
        enrichedIntelligence = mockAdLibraryHooks[record.angle] || enrichedIntelligence;
      }

      // Ask the AI to generate a hook script for this specific angle, using Ad Library Intelligence
      const scriptResponse = await fetch(hermesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "system",
          session_id: `${orgId}-creative-${record.id}`,
          message: `Generate a compelling 15-second video ad hook script for the "${record.angle}" angle. The product URL/Image is: ${productUrl}. 
          
          INTELLIGENCE ENRICHMENT (From ScrapeGraphAI SearchGraph):
          Based on recent competitor data autonomously scraped from the web, the highest converting hook framework for this niche is: "${enrichedIntelligence}"
          ${visualStyle}
          ${engagementStrategy}
          ${viralHashtags}
          
          Use this framework to generate the final script. Return ONLY the script text, no explanation.`,
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
