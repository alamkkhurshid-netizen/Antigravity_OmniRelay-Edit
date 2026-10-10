import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VOICE_ENGINE_URL = process.env.VOICE_ENGINE_URL || "https://130.210.29.75.sslip.io";

export async function GET() {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${VOICE_ENGINE_URL}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "degraded",
          engine_url: VOICE_ENGINE_URL,
          http_status: response.status,
          latency_ms: latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 502 }
      );
    }

    const data = await response.json().catch(() => ({ status: "ok" }));

    return NextResponse.json({
      status: "healthy",
      engine_url: VOICE_ENGINE_URL,
      latency_ms: latencyMs,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json(
      {
        status: "unreachable",
        engine_url: VOICE_ENGINE_URL,
        error: err.name === "AbortError" ? "Connection timeout (>4000ms)" : err.message,
        latency_ms: latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
