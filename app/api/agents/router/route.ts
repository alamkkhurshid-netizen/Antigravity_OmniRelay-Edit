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
      const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

      // 1. Generate embedding for the user's message
      const embedResult = await embeddingModel.embedContent(payload.message || "");
      const queryEmbedding = embedResult.embedding.values;

      // 2. Perform Vector Search (RAG) in Supabase
      // Using the Supabase Service Key to bypass RLS in the edge function if necessary, or rely on RLS if authenticated
      // We will assume the service key is available for system-level RAG lookups
      const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      let ragContext = "No relevant knowledge base documents found.";
      
      if (serviceKey) {
        const adminSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", serviceKey);
        const { data: matchedDocs, error: matchError } = await adminSupabase.rpc('match_documents', {
          query_embedding: queryEmbedding,
          match_threshold: 0.5,
          match_count: 5,
          p_organization_id: orgId
        });

        if (!matchError && matchedDocs && matchedDocs.length > 0) {
          ragContext = matchedDocs.map((doc: any) => doc.content).join("\n\n---\n\n");
        }
      }

      // 3. Inject RAG context into the Gemini Prompt
      const prompt = `
        You are the OmniRelay AI Customer Support & Sales Agent.
        Analyze the incoming user message and generate a response based strictly on the provided Knowledge Base context.
        
        Knowledge Base Context:
        ${ragContext}
        
        Incoming Event:
        Source: ${source}
        Event Type: ${event_type}
        User Message: ${JSON.stringify(payload)}

        Return a JSON object matching this schema:
        {
          "agent_role": "Customer Support | Sales | Clinical",
          "proposed_action": "Short description of what the AI wants to do",
          "draft_payload": { "text": "The exact message to reply to the user based on the knowledge base" }
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
