import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini Flash for the fast Router model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    
    // In a real webhook, org ID would be derived from the auth or webhook token
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from('user_profiles').select('active_organization_id').eq('id', user.id).single();
    if (!profile?.active_organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const orgId = profile.active_organization_id;

    // Parse incoming event (e.g., from WhatsApp or an Order system)
    const body = await req.json();
    const { source, event_type, payload } = body;

    // Fast Classification using Gemini 1.5 Flash (Mocked here for the architecture)
    // const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    // const prompt = `Classify this incoming event: ${JSON.stringify(payload)}...`;
    // const result = await model.generateContent(prompt);
    
    console.log(`[Router] Received ${event_type} from ${source}. Classifying with fast model...`);

    // Let's assume the model decided this needs an Approval Loop
    // and drafted a response.
    const draftedAction = {
      organization_id: orgId,
      agent_role: source === 'whatsapp' ? 'concierge' : 'marketing',
      context_source: event_type,
      proposed_action: source === 'whatsapp' ? 'send_whatsapp_message' : 'launch_ad_campaign',
      draft_payload: {
        text: `Hello! I see you just placed an order. Here is your tracking number...`,
        original_event: payload
      },
      status: 'pending_approval'
    };

    const { error } = await supabase
      .from('ai_agent_drafts')
      .insert(draftedAction);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      message: "Task classified. Draft created for human approval." 
    });

  } catch (error: any) {
    console.error("[Router] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
