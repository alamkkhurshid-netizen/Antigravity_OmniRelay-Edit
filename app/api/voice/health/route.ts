import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const configuredEngineUrl = process.env.VOICE_ENGINE_URL;
  const isProduction = process.env.NODE_ENV === "production";

  // Require explicit engine URL in production
  if (isProduction && !configuredEngineUrl) {
    return NextResponse.json(
      {
        liveness: "ok",
        readiness: "unconfigured",
        status: "degraded",
        error: "VOICE_ENGINE_URL is not configured in production environment.",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  const engineUrl = configuredEngineUrl || "https://130.210.29.75.sslip.io";

  // Check operator authorization for detailed infrastructure diagnostics
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isOperator = !!(
    token &&
    (token === process.env.VOICE_ENGINE_API_KEY ||
      token === process.env.SUPABASE_SECRET_KEY ||
      token === process.env.INTERNAL_SERVICE_KEY)
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${engineUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const httpLatencyMs = Date.now() - startTime;

    if (!response.ok) {
      return NextResponse.json(
        {
          liveness: "degraded",
          readiness: "down",
          status: "degraded",
          http_status: response.status,
          http_latency_ms: httpLatencyMs,
          engine: isOperator ? engineUrl : "omnirelay-voice-cluster",
          timestamp: new Date().toISOString(),
        },
        { status: 502 }
      );
    }

    const payload = await response.json().catch(() => ({ status: "unknown" }));

    // Inspect dependency readiness
    const deps = payload?.dependencies || {};
    const criticalMissing =
      deps.primary_llm_groq === "missing_key" ||
      deps.stt_deepgram === "missing_key" ||
      deps.tts_cartesia === "missing_key";

    const isDegraded = payload?.status !== "healthy" || criticalMissing;
    const finalStatus = isDegraded ? "degraded" : "healthy";

    return NextResponse.json({
      liveness: "ok",
      readiness: isDegraded ? "degraded" : "ready",
      status: finalStatus,
      http_latency_ms: httpLatencyMs,
      engine: isOperator ? engineUrl : "omnirelay-voice-cluster",
      version: payload?.version || "2.0.0",
      ...(isOperator ? { diagnostics: payload } : { dependencies_ready: !criticalMissing }),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const httpLatencyMs = Date.now() - startTime;
    const isTimeout = err.name === "AbortError";

    return NextResponse.json(
      {
        liveness: "unreachable",
        readiness: "down",
        status: "unreachable",
        error: isTimeout ? "Engine probe timed out (>4000ms)" : err.message,
        http_latency_ms: httpLatencyMs,
        engine: isOperator ? engineUrl : "omnirelay-voice-cluster",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
