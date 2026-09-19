import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { guideContextForConversation, guideSystemPrompt } from "@/lib/omni-relay-guide";

type ChatTurn = { role?: string; text?: string };
const encoder = new TextEncoder();
function cleanTurn(value: ChatTurn) { const role = value.role === "model" ? "model" : "user"; const text = String(value.text ?? "").trim().slice(0, 800); return text ? { role, parts: [{ text }] } : null; }
function textFromGeminiEvent(value: unknown) { const record = value as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }; return record.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""; }

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  const payload = await request.json().catch(() => ({})) as { question?: string; pathname?: string; history?: ChatTurn[] };
  const question = String(payload.question ?? "").trim();
  if (question.length < 2 || question.length > 800) return NextResponse.json({ error: "Ask a question between 2 and 800 characters." }, { status: 400 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OmniRelay Guide is being configured. Add the Gemini API key to enable answers." }, { status: 503 });
  const history = Array.isArray(payload.history) ? payload.history.slice(-6).map(cleanTurn).filter(Boolean) : [];
  const guide = guideContextForConversation(String(payload.pathname ?? ""), question, Array.isArray(payload.history) ? payload.history.slice(-6) : []);
  const contents = [...history, { role: "user", parts: [{ text: question }] }];
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ systemInstruction: { parts: [{ text: guideSystemPrompt(guide.primary, guide.related) }] }, contents, generationConfig: { temperature: 0.1, maxOutputTokens: 420 } }) }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return NextResponse.json({ error: "OmniRelay Guide is temporarily unavailable. Please try again." }, { status: 503 });
  const reader = upstream.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
  const emitEvents = (controller: ReadableStreamDefaultController<Uint8Array>, final = false) => { const events = buffer.split(/\r?\n\r?\n/); buffer = final ? "" : (events.pop() ?? ""); for (const event of final ? events.filter(Boolean) : events) for (const rawLine of event.split(/\r?\n/)) { const line = rawLine.trim(); if (!line.startsWith("data:")) continue; try { const text = textFromGeminiEvent(JSON.parse(line.slice(5).trim())); if (text) controller.enqueue(encoder.encode(text)); } catch { /* Ignore a malformed upstream event. */ } } };
  const stream = new ReadableStream<Uint8Array>({ async pull(controller) { const { done, value } = await reader.read(); if (done) { buffer += decoder.decode(); emitEvents(controller, true); controller.close(); return; } buffer += decoder.decode(value, { stream: true }); emitEvents(controller); }, cancel() { void reader.cancel(); } });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
