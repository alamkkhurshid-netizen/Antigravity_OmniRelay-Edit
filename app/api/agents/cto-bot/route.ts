import { NextResponse } from "next/server";
import { createKnowledgeEmbedding, vectorLiteral } from "@/lib/rag-embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { ctoBotSchema } from "@/lib/validators";

// Use Gemini SDK for text generation
const generateCtoResponse = async (question: string, context: string, history: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is not configured.");

  const systemPrompt = `You are the "Super CTO" and Full-Stack Architect of OmniRelay.
You are brutally honest, direct, and focus deeply on business value and technical architecture.
You must answer questions about what you have built based ONLY on the provided system architecture context.
If asked about features, explain what they are, why they were built (business value/impact), and how they work technically.
If the context does not contain the answer, bluntly state that it's not in the architecture documentation.
Keep your answers highly detailed but structured. Use Markdown.

CONTEXT:
${context}

PREVIOUS CHAT:
${history}
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\nUSER QUESTION:\n" + question }] }
      ]
    })
  });

  if (!response.ok) throw new Error("Failed to generate response from Gemini.");
  const payload = await response.json();
  return payload.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
};

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

    const rateLimit = checkRateLimit(`cto_bot_${user.id}`, 10, 60 * 1000);
    if (!rateLimit.success) {
      logger.warn("Rate limit exceeded for CTO bot", { userId: user.id, orgId: organization.id });
      return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
    }

    const payload = await request.json().catch(() => ({}));
    // Note: The validator expects 'prompt' but the route expects 'question'. 
    // We'll map 'question' -> 'prompt' for the schema.
    const parseResult = ctoBotSchema.safeParse({ prompt: payload.question || "" });
    const history = typeof payload.history === "string" ? payload.history : "";
    
    if (!parseResult.success) {
      return NextResponse.json({ 
        error: "Validation failed", 
        details: parseResult.error.format() 
      }, { status: 422 });
    }
    
    const question = parseResult.data.prompt;

  let semanticSources: any[] = [];
  try {
    const embedding = await createKnowledgeEmbedding(question, "QUESTION_ANSWERING");
    const admin = createAdminClient();
    
    // Call the newly created RPC for architecture chunks
    const { data, error } = await admin.rpc("match_architecture_chunks", {
      query_embedding: vectorLiteral(embedding), 
      match_threshold: 0.5, // slightly lower threshold for broad architectural concepts
      match_count: 5, 
      p_organization_id: organization.id
    });
    
    if (error) {
        logger.error("RPC Error in CTO bot", error, { route: "/api/agents/cto-bot" });
    }
    semanticSources = data ?? [];
  } catch (e) {
    logger.error("Embedding Error in CTO bot", e, { route: "/api/agents/cto-bot" });
    return NextResponse.json({ error: "Failed to search architecture knowledge base." }, { status: 500 });
  }

  const contextText = semanticSources.map(s => `[Source: ${s.title}]\n${s.content}`).join("\n\n---\n\n");

  try {
    const answer = await generateCtoResponse(question, contextText, history);
    
    return NextResponse.json({
      answer,
      sources: semanticSources.map(s => ({ title: s.title, similarity: s.similarity }))
    });
  } catch (e: any) {
    logger.error("Generation Error in CTO bot", e, { route: "/api/agents/cto-bot" });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  } catch (error) {
    logger.error("CTO bot failed unexpectedly", error, { route: "/api/agents/cto-bot" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
