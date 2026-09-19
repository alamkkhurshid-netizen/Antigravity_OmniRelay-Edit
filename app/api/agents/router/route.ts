import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    console.log(`[Router] Received ${event_type} from ${source}. Forwarding to Hermes Agent...`);

    // Bridge to Hermes Agent Microservice
    const hermesUrl = process.env.HERMES_AGENT_URL || "http://localhost:8000/api/v1/agent/invoke";
    
    // Pass the payload and the workspace context so Hermes knows who is asking
    // and can save the draft to the correct organization using the save_draft skill.
    const hermesPayload = {
      user_id: user.id,
      session_id: `${orgId}-${source}`, // For Honcho dialectic memory
      message: `Event from ${source}: ${JSON.stringify(payload)}`,
      context: {
        workspace_id: orgId,
        payload_type: event_type
      }
    };

    // We do not wait for the Hermes agent to finish synchronously if it's a long running task, 
    // but for this architecture we trigger it and return immediately. The Hermes agent will 
    // autonomously call the 'save_draft' python skill when it's done thinking.
    fetch(hermesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(hermesPayload)
    }).catch(err => {
      console.error("[Hermes Bridge Error]:", err);
    });

    return NextResponse.json({ 
      success: true, 
      message: "Event forwarded to Hermes Agent. A draft will appear in the Action Centre shortly." 
    });

  } catch (error: any) {
    console.error("[Router] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
