/**
 * OmniRelay Uptime Monitoring & Subsystem Health Checks
 * S9-12: Real probes for Database (Supabase), Voice AI, and WhatsApp Integration
 */

export interface SubsystemHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  message?: string;
  required?: boolean;
}

export interface SystemHealthReport {
  status: "healthy" | "degraded" | "down";
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  subsystems: Record<string, SubsystemHealth>;
}

/**
 * Performs concurrent non-blocking real health probes on core dependencies
 */
export async function runSystemHealthChecks(): Promise<SystemHealthReport> {
  const uptimeSeconds = Math.round(process.uptime());
  const environment = process.env.TARGET_ENV || process.env.NODE_ENV || "production";

  // 1. Safe Real Read-Only Probe: Supabase Database
  const dbStart = Date.now();
  let dbStatus: SubsystemHealth = {
    name: "Supabase Database (PostgreSQL)",
    status: "down",
    latencyMs: 0,
    required: true,
  };

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      dbStatus.status = "down";
      dbStatus.message = "Database configuration missing: SUPABASE_URL or key not set";
      dbStatus.latencyMs = Date.now() - dbStart;
    } else {
      // Execute a real, lightweight read-only query against REST API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const dbRes = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/rest/v1/system_runtime_controls?select=control_key&limit=1`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      dbStatus.latencyMs = Date.now() - dbStart;

      if (dbRes.ok) {
        dbStatus.status = "healthy";
        dbStatus.message = "PostgreSQL read-only probe passed via Supabase REST API";
      } else {
        dbStatus.status = "down";
        dbStatus.message = `Database returned HTTP ${dbRes.status}: ${dbRes.statusText}`;
      }
    }
  } catch (err: unknown) {
    dbStatus.latencyMs = Date.now() - dbStart;
    dbStatus.status = "down";
    dbStatus.message = err instanceof Error ? err.message : "Database connection failed";
  }

  // 2. Safe Real Probe: Voice AI Microservice
  const voiceStart = Date.now();
  let voiceStatus: SubsystemHealth = {
    name: "Voice AI Runtime",
    status: "down",
    latencyMs: 0,
    required: true,
  };

  try {
    const voiceEngineUrl = process.env.VOICE_ENGINE_URL || "https://130.210.29.75.sslip.io";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const voiceRes = await fetch(`${voiceEngineUrl.replace(/\/$/, "")}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    voiceStatus.latencyMs = Date.now() - voiceStart;

    if (voiceRes.ok) {
      const voiceData = await voiceRes.json().catch(() => null);
      if (voiceData && voiceData.status === "healthy") {
        voiceStatus.status = "healthy";
        voiceStatus.message = `Voice AI operational (commit: ${voiceData.commit_sha?.substring(0, 7) || "unknown"}, redis: ${voiceData.redis?.connected ? "connected" : "disconnected"})`;
      } else {
        voiceStatus.status = "degraded";
        voiceStatus.message = `Voice engine reported status: ${voiceData?.status || "unknown"}`;
      }
    } else {
      voiceStatus.status = "down";
      voiceStatus.message = `Voice engine returned HTTP ${voiceRes.status}`;
    }
  } catch (err: unknown) {
    voiceStatus.latencyMs = Date.now() - voiceStart;
    voiceStatus.status = "down";
    voiceStatus.message = err instanceof Error ? err.message : "Voice engine unreachable";
  }

  // 3. Provider Check: WhatsApp / Meta Messaging
  // "Report WhatsApp as configured/unverified unless a safe real provider check is available."
  const hasWhatsAppConfig = Boolean(
    process.env.WHATSAPP_TOKEN ||
    process.env.META_WHATSAPP_TOKEN ||
    process.env.WHATSAPP_PHONE_NUMBER_ID
  );

  const metaStatus: SubsystemHealth = {
    name: "Meta WhatsApp Cloud API",
    status: "degraded",
    latencyMs: 0,
    required: false,
    message: hasWhatsAppConfig
      ? "Provider credentials configured; live provider check unverified (operating on HOLD)"
      : "Provider unconfigured (on HOLD for staging)",
  };

  // 4. Runtime Node Memory & Event Loop
  const memUsage = process.memoryUsage();
  const memoryStatus: SubsystemHealth = {
    name: "Runtime Memory & Event Loop",
    status: memUsage.heapUsed < 2 * 1024 * 1024 * 1024 ? "healthy" : "degraded",
    latencyMs: 0,
    required: true,
    message: `Heap used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
  };

  const subsystems = {
    database: dbStatus,
    voice_ai: voiceStatus,
    whatsapp: metaStatus,
    runtime: memoryStatus,
  };

  // Determine overall status
  const requiredDown = Object.values(subsystems).some(
    (s) => s.required && s.status === "down"
  );
  const requiredDegraded = Object.values(subsystems).some(
    (s) => s.required && s.status === "degraded"
  );
  const anyDegraded = Object.values(subsystems).some((s) => s.status === "degraded");

  let overallStatus: SystemHealthReport["status"] = "healthy";
  if (requiredDown) {
    overallStatus = "down";
  } else if (requiredDegraded || anyDegraded) {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    environment,
    subsystems,
  };
}
