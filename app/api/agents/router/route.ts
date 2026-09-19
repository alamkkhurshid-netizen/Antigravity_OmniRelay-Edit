import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from('user_profiles').select('active_organization_id').eq('id', user.id).single();
    if (!profile?.active_organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const orgId = profile.active_organization_id;

    // Parse incoming event
    const body = await req.json();
    const { source, event_type, payload } = body;

    console.log(`[Router] Received ${event_type} from ${source}. Processing Intent...`);

    // Use actual Gemini API for intent routing instead of mocking
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });

      const prompt = `
        You are the OmniRelay AI Router.
        Analyze the following incoming event and determine the appropriate action.
        Source: ${source}
        Event Type: ${event_type}
        Payload: ${JSON.stringify(payload)}

        Return a JSON object matching this schema:
        {
          "agent_role": "Customer Support | Sales | Clinical",
          "proposed_action": "Short description of what the AI wants to do",
          "draft_payload": { "text": "The actual message you want to send" }
        }
      `;

      const result = await model.generateContent(prompt);
      const aiDecision = JSON.parse(result.response.text());

      // Save the draft directly to Action Centre for human approval
      await supabase.from('ai_agent_drafts').insert({
        organization_id: orgId,
        agent_role: aiDecision.agent_role,
        proposed_action: aiDecision.proposed_action,
        draft_payload: aiDecision.draft_payload
      });

      return NextResponse.json({ 
        success: true, 
        message: "AI Router successfully processed the event using Gemini 1.5." 
      });
    }

    // Fallback if no API key is provided
    return NextResponse.json({ 
      success: false, 
      error: "GEMINI_API_KEY is not configured in production." 
    }, { status: 500 });

  } catch (error: unknown) {
    const err = error as Error;
    console.error("[Router] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
