import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

interface AiInsightResponse {
  executiveSummary: string;
  whatHappened: string;
  whyItMatters: string;
  prescribedActions: Array<{
    role: "Reception lead" | "Clinic manager" | "Workspace admin";
    action: string;
    priority: "high" | "medium" | "low";
  }>;
  laborHoursSavedSummary: string;
  source: "gemini" | "rule_engine";
}

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organization) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const metrics = payload.metrics;

  if (!metrics || typeof metrics !== "object") {
    return NextResponse.json({ error: "Invalid metrics payload." }, { status: 400 });
  }

  // Security & Data Minimization Guard: Verify that no prohibited PHI fields are passed
  const forbiddenKeys = ["patient", "phone", "email", "address", "notes", "diagnosis", "prescription", "dob", "dob_year"];
  const payloadString = JSON.stringify(payload).toLowerCase();
  for (const key of forbiddenKeys) {
    if (payloadString.includes(`"${key}"`) && !payloadString.includes(`"${key}count"`) && !payloadString.includes(`"${key}rate"`)) {
      return NextResponse.json(
        { error: "Security validation failed: Payload contains prohibited patient-identifiable data." },
        { status: 400 }
      );
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback: Deterministic Rule-Engine Narration if Gemini API key is missing
  if (!apiKey) {
    const fallbackResponse: AiInsightResponse = {
      executiveSummary: `For the ${metrics.period || "selected"} period, ${organization.name} handled ${metrics.funnel?.booked ?? 0} booked appointments with a ${metrics.funnel?.completionRate ?? "0%"} consultation completion rate and ${metrics.funnel?.noShowRate ?? "0%"} no-show rate. Average queue wait time was ${metrics.avgWaitTimeMinutes ?? 0} minutes.`,
      whatHappened: `${metrics.funnel?.completed ?? 0} patients completed consultations. WhatsApp automation saved an estimated ${metrics.staffHoursSaved ?? "0 hours"} in manual calling time with a ${metrics.whatsappDeliveryRate ?? "100%"} message delivery rate.`,
      whyItMatters:
        Number(String(metrics.funnel?.noShowRate ?? "0").replace("%", "")) > 15
          ? "The elevated no-show rate indicates potential friction in patient attendance. Automated 24h & 2h WhatsApp reminders should be verified."
          : "Clinic operations are running smoothly with stable attendance and healthy appointment throughput.",
      prescribedActions: [
        {
          role: "Reception lead",
          action: "Monitor patient token pacing during peak chamber hours to keep wait times under 15 minutes.",
          priority: "medium",
        },
        {
          role: "Clinic manager",
          action: "Review doctors with cancellation rates > 10% to ensure availability schedules align with patient booking demand.",
          priority: "low",
        },
        {
          role: "Workspace admin",
          action: "Maintain active WhatsApp Meta template approvals for utility confirmation and care reminders.",
          priority: "low",
        },
      ],
      laborHoursSavedSummary: `WhatsApp automated concierge and care reminders saved approximately ${metrics.staffHoursSaved ?? "0 hours"} of front-desk staff telephone work.`,
      source: "rule_engine",
    };

    return NextResponse.json(fallbackResponse);
  }

  // Gemini Operational Narration (docs/ANALYTICS_AI_OPS_FOUNDATION.md Stage 14E)
  try {
    const systemPrompt = `You are the OmniRelay Clinic Operations AI Advisor.
Your job is to analyze aggregate clinic operational metrics and provide a concise, high-impact executive briefing for the clinic owner.
Follow these strict guidelines:
1. Answer the three core operational questions:
   - What happened?
   - Why does it matter?
   - Whose action is needed?
2. Be practical, crisp, and professional (like a seasoned healthcare operations consultant).
3. Do NOT diagnose patients or invent clinical treatment advice.
4. Focus on operational efficiency: doctor capacity, patient wait times, no-show rates, WhatsApp automation time savings, and staff workflows.
5. Return ONLY a valid JSON object matching this schema:
{
  "executiveSummary": "2-3 sentences summarizing overall clinic health and throughput.",
  "whatHappened": "Key facts regarding bookings, attendance, wait times, and delivery.",
  "whyItMatters": "The primary operational bottleneck or positive breakthrough.",
  "prescribedActions": [
    {
      "role": "Reception lead" | "Clinic manager" | "Workspace admin",
      "action": "Specific concrete action to take.",
      "priority": "high" | "medium" | "low"
    }
  ],
  "laborHoursSavedSummary": "Sentence explaining hours saved through automated messaging."
}`;

    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const userPrompt = `Here are the verified, pre-aggregated clinic operational metrics for ${organization.name}:
${JSON.stringify(metrics, null, 2)}

Produce the operational analysis JSON now.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty candidate from Gemini.");

    const parsed = JSON.parse(rawText);

    return NextResponse.json({
      ...parsed,
      source: "gemini",
    });
  } catch (error) {
    console.error("AI Insights Gemini Error, using fallback:", error);

    // Fallback on error to ensure 100% uptime
    return NextResponse.json({
      executiveSummary: `For the ${metrics.period || "selected"} period, ${organization.name} handled ${metrics.funnel?.booked ?? 0} booked appointments with an average queue wait time of ${metrics.avgWaitTimeMinutes ?? 0} minutes.`,
      whatHappened: `${metrics.funnel?.completed ?? 0} patient consultations completed. WhatsApp automation saved an estimated ${metrics.staffHoursSaved ?? "0 hours"} in front-desk calling time.`,
      whyItMatters: "Operational metrics remain within normal operational bounds. Focus on queue management and attendance reminder coverage.",
      prescribedActions: [
        {
          role: "Reception lead",
          action: "Keep arrival tokens synchronized with doctor chamber consultations.",
          priority: "medium",
        },
        {
          role: "Clinic manager",
          action: "Review doctor capacity distribution and appointment confirmation rates.",
          priority: "low",
        },
      ],
      laborHoursSavedSummary: `WhatsApp automated messaging saved an estimated ${metrics.staffHoursSaved ?? "0 hours"} of manual receptionist effort.`,
      source: "rule_engine",
    });
  }
}
