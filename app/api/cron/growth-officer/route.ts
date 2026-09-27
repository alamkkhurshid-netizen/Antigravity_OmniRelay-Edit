import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET(req: Request) {
  try {
    // 1. Verify Vercel Cron Security Header
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
    const founderNumber = process.env.FOUNDER_WHATSAPP_NUMBER;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const apiKey = process.env.GEMINI_API_KEY || "";

    if (!systemToken || !phoneNumberId || !founderNumber || !supabaseKey || !apiKey) {
      return NextResponse.json({ error: "Missing config" }, { status: 500 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", supabaseKey);
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log("[Growth Officer] Commencing weekly analytics aggregation...");

    // 2. Aggregate Data Metrics
    // Get total number of autonomous AI code patches
    const { count: ctoFixesCount, error: err1 } = await supabase
      .from('ai_governance_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    // Get total number of AI customer support interactions (Action Centre Drafts)
    const { count: supportDraftsCount, error: err2 } = await supabase
      .from('ai_agent_drafts')
      .select('*', { count: 'exact', head: true });

    // 3. Formulate the Strategy Prompt
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `
      You are the OmniRelay "Growth & Strategy Officer" Agent.
      It is Monday morning. You are preparing a concise, high-impact weekly WhatsApp brief for the Founder.
      
      Weekly Metrics:
      - Super CTO Autonomous Code Fixes Approved: ${ctoFixesCount || 0}
      - Support Lead Customer Drafts Generated: ${supportDraftsCount || 0}
      
      Task:
      Write a short, professional, and encouraging WhatsApp message to the founder summarizing these metrics. 
      Point out how much time the multi-agent system saved them this week. 
      Keep it under 100 words. Do not use Markdown, just plain text with emojis.
    `;

    const result = await model.generateContent(prompt);
    let brief = result.response.text().trim();

    console.log("[Growth Officer] Strategy Brief generated. Sending to Founder...");

    // 4. Send the Strategic Brief via WhatsApp
    const messageText = `📈 *Growth Officer Weekly Brief* 📈\n\n${brief}`;
    
    await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${systemToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: founderNumber,
        type: "text",
        text: { body: messageText }
      })
    });

    return NextResponse.json({ status: "success", brief: messageText });

  } catch (error: any) {
    console.error("[Growth Officer] Internal Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
