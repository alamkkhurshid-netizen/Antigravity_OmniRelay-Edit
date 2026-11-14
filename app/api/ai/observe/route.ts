import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

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
      format: "enum",
      enum: ["low", "medium", "high"],
      description: "Assess the risk level of applying this patch."
    }
  },
  required: ["diagnosis", "affected_files", "proposed_patch", "risk_level"]
};

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 1. Authentication Gate (F-22 Remediation)
    // Must be either an internal service call with valid OBSERVER_SECRET or an authenticated user session
    const authHeader = req.headers.get("authorization") || "";
    const observerSecretHeader = req.headers.get("x-observer-secret") || "";
    const configuredObserverSecret = process.env.OBSERVER_SECRET;

    let isAuthenticated = false;
    let callingUserId: string | null = null;

    if (
      configuredObserverSecret &&
      configuredObserverSecret.length >= 16 &&
      observerSecretHeader
    ) {
      const incomingBuf = Buffer.from(observerSecretHeader);
      const expectedBuf = Buffer.from(configuredObserverSecret);
      if (incomingBuf.length === expectedBuf.length && crypto.timingSafeEqual(incomingBuf, expectedBuf)) {
        isAuthenticated = true;
      }
    }

    if (!isAuthenticated && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (!userError && userData?.user) {
        isAuthenticated = true;
        callingUserId = userData.user.id;
      }
    }

    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "Unauthorized: Valid session or internal observer secret required." },
        { status: 401 }
      );
    }

    // 2. Parse and Validate Error Payload
    const errorPayload = await req.json().catch(() => null);
    if (!errorPayload || !errorPayload.message) {
      return NextResponse.json({ error: "Missing error payload" }, { status: 400 });
    }

    const orgId = errorPayload.organization_id;
    if (!orgId || typeof orgId !== "string") {
      return NextResponse.json({ error: "organization_id is strictly required" }, { status: 400 });
    }

    // If caller is an authenticated user, verify they belong to this organization
    if (callingUserId) {
      const { data: membership } = await supabase
        .from("agents")
        .select("id")
        .eq("organization_id", orgId)
        .eq("user_id", callingUserId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Forbidden: Not a member of this workspace." }, { status: 403 });
      }
    }

    // 3. OEM CONTROL & MONETIZATION LAYER
    const { data: orgData } = await supabase
      .from("organizations")
      .select("premium_cto_agent_active")
      .eq("id", orgId)
      .single();

    if (!orgData?.premium_cto_agent_active) {
      return NextResponse.json(
        {
          success: false,
          error: "PRO Tier Required: The AI Super CTO is only available on premium plans. Please upgrade your workspace."
        },
        { status: 403 }
      );
    }

    // 4. Input Sanitization & Prompt Construction
    const safeMessage = String(errorPayload.message).slice(0, 1000);
    const safeStack = String(errorPayload.stack || "No stack trace provided").slice(0, 2000);
    const safeContext = JSON.stringify(errorPayload.context || {}).slice(0, 1500);

    const prompt = `
      You are the OmniRelay "Super CTO" Autonomous Agent.
      An error has been caught in the production system.
      
      Error Message: ${safeMessage}
      Stack Trace: ${safeStack}
      Context / Payload: ${safeContext}
      
      Your task is to analyze this error, diagnose the root cause, identify the affected files, and write a precise code patch to fix it.
      Return your analysis strictly adhering to the JSON schema provided.
    `;

    // 5. Call Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: "AI service unconfigured" }, { status: 503 });
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const aiResponse = JSON.parse(responseText);

    // 6. Save into Governance Queue
    const { data, error: dbError } = await supabase
      .from("ai_governance_queue")
      .insert([
        {
          source_error: {
            message: safeMessage,
            stack: safeStack,
            context: safeContext,
            timestamp: new Date().toISOString()
          },
          diagnosis: aiResponse.diagnosis,
          affected_files: aiResponse.affected_files,
          proposed_patch: aiResponse.proposed_patch,
          risk_level: aiResponse.risk_level,
          status: "pending_review",
          organization_id: orgId
        }
      ])
      .select();

    if (dbError) {
      console.error("[Super CTO] Error saving to governance queue:", dbError);
      return NextResponse.json({ error: "Failed to queue patch for review" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Error analyzed by Super CTO. Patch staged in governance queue.",
      data: data ? data[0] : null
    });
  } catch (error: any) {
    console.error("[Super CTO] Observe Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
