import { NextResponse } from "next/server";
import { createKnowledgeEmbedding, vectorLiteral } from "@/lib/rag-embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace";

const words = (value: string) =>
  [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];

const includesPhrase = (value: string, phrases: string[]) =>
  phrases.some((phrase) => value.includes(phrase));

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = (await request.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof payload.question === "string" ? payload.question.trim() : "";
  if (question.length < 3 || question.length > 500) {
    return NextResponse.json({ error: "Enter a question between 3 and 500 characters." }, { status: 400 });
  }

  const [{ data: agent }, { data: knowledge }, { data: services }, { data: locations }] = await Promise.all([
    supabase.from("ai_agent_profiles").select("handoff_message").eq("organization_id", organization.id).eq("role", "booking_concierge").maybeSingle(),
    supabase.from("rag_knowledge_items").select("id,title,content,source_type,updated_at").eq("organization_id", organization.id).eq("status", "approved").limit(100),
    supabase.from("organization_services").select("id,name,duration_minutes,price_paise").eq("organization_id", organization.id).eq("booking_enabled", true).order("name"),
    supabase.from("business_locations").select("id,name,address,phone").eq("organization_id", organization.id).order("name"),
  ]);

  const normalizedQuestion = question.toLowerCase();
  const urgent = includesPhrase(normalizedQuestion, [
    "chest pain", "cannot breathe", "can't breathe", "difficulty breathing",
    "unconscious", "severe bleeding", "heavy bleeding", "medical emergency",
    "suicidal", "overdose",
  ]);
  if (urgent) {
    return NextResponse.json({
      answer: "This may need urgent attention. Please contact local emergency services or the clinic's emergency number now. Do not wait for a chat reply.",
      confidence: "handoff",
      classification: "urgent",
      sources: [],
      liveFacts: [],
      safety: "Urgent language detected. The concierge stopped normal answering and escalated immediately.",
    });
  }

  const clinicalAdvice = includesPhrase(normalizedQuestion, [
    "what medicine", "which medicine", "what drug", "which drug", "dosage",
    "dose should", "should i take", "can i take", "diagnose", "diagnosis",
    "treatment should", "prescribe", "change my medicine", "stop my medicine",
  ]);
  if (clinicalAdvice) {
    return NextResponse.json({
      answer: agent?.handoff_message ?? "I will connect you with the clinic team for this question.",
      confidence: "handoff",
      classification: "clinical_handoff",
      sources: [],
      liveFacts: [],
      safety: "Clinical advice was requested. The concierge did not diagnose, prescribe or suggest a dosage.",
    });
  }

  const terms = words(question);
  const lexicalFallback = (knowledge ?? []).map((item) => {
    const title = item.title.toLowerCase(), content = item.content.toLowerCase();
    return { ...item, score: terms.reduce((sum, term) => sum + (title.includes(term) ? 4 : 0) + (content.includes(term) ? 1 : 0), 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

  let semanticSources: { id: string; document_id: string; title: string; source_type: string; content: string; updated_at: string; similarity: number }[] = [];
  try {
    const embedding = await createKnowledgeEmbedding(question, "QUESTION_ANSWERING");
    const admin = createAdminClient();
    const { data } = await admin.rpc("match_rag_knowledge_chunks", {
      query_embedding: vectorLiteral(embedding), match_threshold: 0.58, match_count: 3, p_organization_id: organization.id,
    });
    semanticSources = data ?? [];
  } catch {
    // Indexing and model availability must never make the safety-preview unavailable.
  }

  const asksServices = terms.some((term) => ["service","consultation","price","cost","fee","charge","duration"].includes(term));
  const asksLocation = terms.some((term) => ["location","address","chamber","clinic","phone","where"].includes(term));
  const liveFacts: string[] = [];
  if (asksServices && services?.length) {
    liveFacts.push(`Services: ${services.slice(0, 6).map((service) => {
      const price = service.price_paise ? `₹${new Intl.NumberFormat("en-IN").format(service.price_paise / 100)}` : "price on request";
      return `${service.name} (${service.duration_minutes} min, ${price})`;
    }).join("; ")}.`);
  }
  if (asksLocation && locations?.length) {
    liveFacts.push(`Locations: ${locations.slice(0, 6).map((location) => `${location.name}${location.address ? ` — ${location.address}` : ""}`).join("; ")}.`);
  }

  const sources = semanticSources.length ? semanticSources : lexicalFallback;
  if (!sources.length && !liveFacts.length) {
    return NextResponse.json({
      answer: agent?.handoff_message ?? "I will connect you with the clinic team for this question.",
      confidence: "handoff",
      classification: "no_source",
      sources: [],
      liveFacts: [],
      safety: "No approved source matched. The concierge did not invent an answer.",
    });
  }

  return NextResponse.json({
    answer: [sources.map((item) => item.content.trim()).join("\n\n"), ...liveFacts].filter(Boolean).join("\n\n"),
    confidence: sources.length && (semanticSources.length || liveFacts.length || ("score" in sources[0] && sources[0].score >= 4)) ? "grounded" : "limited",
    classification: "business_answer",
    sources: sources.map((item) => ({ id: "document_id" in item ? item.document_id : item.id, title: item.title, sourceType: item.source_type, updatedAt: item.updated_at })),
    liveFacts,
    safety: semanticSources.length
      ? "Preview retrieved cited, approved workspace knowledge and live clinic configuration only. It does not call a generative answer model."
      : "Preview uses approved workspace knowledge and live clinic configuration only. Semantic indexing is not available for this answer, so it used the safe lexical fallback. It does not call a generative model.",
  });
}
