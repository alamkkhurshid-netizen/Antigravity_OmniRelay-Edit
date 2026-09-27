import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Define the exact JSON schema we want Gemini to return
const responseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    diagnosis: {
      type: SchemaType.STRING,
      description: "A clear, CTO-level explanation of what went wrong based on the error log and stack trace."
    },
    affected_files: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "List of file paths that need to be patched to fix this error."
    },
    proposed_patch: {
      type: SchemaType.STRING,
      description: "The exact code diff or replacement code required to fix the issue."
    },
    risk_level: {
      type: SchemaType.STRING,

      enum: ["low", "medium", "high"],
      description: "Assess the risk level of applying this patch."
    }
  },
  required: ["diagnosis", "affected_files", "proposed_patch", "risk_level"]
};

export async function POST(req: Request) {
  try {
    // Initialize clients INSIDE the handler so Next.js build doesn't crash from missing env variables
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "", supabaseKey);

    // 1. Receive the raw error payload from the Observer (frontend or backend error boundary)
    const errorPayload = await req.json();

    if (!errorPayload || !errorPayload.message) {
      return NextResponse.json({ error: "Missing error payload" }, { status: 400 });
    }

    // 2. Formulate the System Prompt for the Super CTO Agent
    const prompt = `
      You are the OmniRelay "Super CTO" Autonomous Agent.
      An error has been caught in the production system.
      
      Error Message: ${errorPayload.message}
      Stack Trace: ${errorPayload.stack || 'No stack trace provided'}
      Context / Payload: ${JSON.stringify(errorPayload.context || {})}
      
      Your task is to analyze this error, diagnose the root cause, identify the affected files, and write a precise code patch to fix it.
      Return your analysis strictly adhering to the JSON schema provided.
    `;

    // 3. Call Gemini 1.5 Pro
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse the strict JSON output
    const aiResponse = JSON.parse(responseText);

    // 4. Save the fix into the Secure Governance Queue using the Service Key
    const { data, error: dbError } = await supabase
      .from('ai_governance_queue')
      .insert([
        {
          source_error: errorPayload,
          diagnosis: aiResponse.diagnosis,
          proposed_patch: aiResponse.proposed_patch,
          affected_files: aiResponse.affected_files,
          risk_level: aiResponse.risk_level,
          status: 'pending' // Enforces the Human-in-the-Loop check
        }
      ])
      .select()
      .single();

    if (dbError) {
      console.error("Failed to insert into ai_governance_queue:", dbError);
      return NextResponse.json({ error: "Failed to queue AI patch" }, { status: 500 });
    }

    // (Phase 4 Milestone 3 hook will go here: Trigger WhatsApp Notification)
    // await notifyFounderViaWhatsApp(data.id, aiResponse.diagnosis, aiResponse.risk_level);

    return NextResponse.json({
      success: true,
      message: "AI has diagnosed the issue and queued a patch for approval.",
      queue_id: data.id
    });

  } catch (error: any) {
    console.error("Super CTO Agent Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
