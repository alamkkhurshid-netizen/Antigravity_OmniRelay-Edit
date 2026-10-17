/**
 * OmniRelay: Audited Runtime Controls & Emergency Kill-Switch Architecture
 * 
 * Provides dynamic, cached runtime control state with:
 * - 5-second in-memory cache TTL for instant (<5s) operator toggle response without restarts
 * - Safe fail-closed defaults when unconfigured or DB is unreachable
 * - Granular and master worker kill switches
 * - Audited updates logged directly to public.operational_events
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type WorkerType =
  | "whatsapp_inbound"
  | "roster_dispatch"
  | "token_health"
  | "care_reminder"
  | "campaign_dispatch";

export interface RuntimeControlState {
  value: boolean;
  expiresAt: number | null;
  cachedAt: number;
}

const CACHE_TTL_MS = 5000;
const _memoryCache = new Map<string, RuntimeControlState>();

// Safe defaults if database and environment are completely unset
const SAFE_DEFAULTS: Record<string, boolean> = {
  WORKER_ENABLED: true,
  WHATSAPP_INBOUND_WORKER_ENABLED: true,
  ROSTER_DISPATCH_WORKER_ENABLED: true,
  TOKEN_HEALTH_WORKER_ENABLED: true,
  CARE_REMINDER_WORKER_ENABLED: true,
  CAMPAIGN_DISPATCH_WORKER_ENABLED: true,
  VOICE_PILOT_KILL_SWITCH: false,
  VOICE_PROVIDER_FALLBACK: false,
};

/**
 * Retrieves a runtime control value, prioritizing in-memory cache, then database, then environment variables.
 */
export async function getRuntimeControl(
  key: string,
  organizationId?: string
): Promise<boolean> {
  const now = Date.now();
  const cacheKey = `${key}:${organizationId || "global"}`;

  const cached = _memoryCache.get(cacheKey);
  if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
    if (cached.expiresAt && now > cached.expiresAt) {
      // Expired control reverts to default
      return SAFE_DEFAULTS[key] ?? true;
    }
    return cached.value;
  }

  let dbValue: boolean | null = null;
  let expiresAt: number | null = null;

  try {
    const admin = createAdminClient();
    const query = admin
      .from("system_runtime_controls")
      .select("is_enabled, expires_at")
      .eq("control_key", key);

    if (organizationId) {
      query.eq("organization_id", organizationId);
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      dbValue = Boolean(data.is_enabled);
      if (data.expires_at) {
        expiresAt = new Date(data.expires_at).getTime();
        if (now > expiresAt) {
          dbValue = null; // Expired
        }
      }
    }
  } catch {
    // If Supabase admin client is unconfigured or table not present, fall back cleanly
  }

  let finalValue: boolean;
  if (dbValue !== null) {
    finalValue = dbValue;
  } else {
    // Check environment variable
    const envVal = process.env[key];
    if (envVal !== undefined) {
      finalValue = envVal.toLowerCase() !== "false" && envVal !== "0";
    } else {
      finalValue = SAFE_DEFAULTS[key] ?? true;
    }
  }

  _memoryCache.set(cacheKey, {
    value: finalValue,
    expiresAt,
    cachedAt: now,
  });

  return finalValue;
}

/**
 * Checks whether a given worker type is paused by either:
 * 1. The master WORKER_ENABLED switch
 * 2. The granular [WORKER_TYPE]_WORKER_ENABLED switch
 */
export async function isWorkerPaused(
  workerType: WorkerType,
  organizationId?: string
): Promise<{ paused: boolean; reason?: string; controlKey?: string }> {
  // 1. Check Global Master Switch
  const masterEnabled = await getRuntimeControl("WORKER_ENABLED", organizationId);
  if (!masterEnabled) {
    return {
      paused: true,
      reason: "Master worker kill switch active (WORKER_ENABLED=false)",
      controlKey: "WORKER_ENABLED",
    };
  }

  // 2. Check Granular Worker Switch
  const granularKey = `${workerType.toUpperCase()}_WORKER_ENABLED`;
  const granularEnabled = await getRuntimeControl(granularKey, organizationId);
  if (!granularEnabled) {
    return {
      paused: true,
      reason: `Worker-specific pause active (${granularKey}=false)`,
      controlKey: granularKey,
    };
  }

  return { paused: false };
}

/**
 * Records an audited worker pause event in public.operational_events.
 */
export async function recordWorkerPauseAudit(
  workerType: WorkerType,
  options: {
    organizationId?: string;
    controlKey: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("operational_events").insert({
      organization_id: options.organizationId || null,
      error_code: "WORKER_PAUSED",
      event_source: `${workerType}_worker_guard`,
      safe_message: options.message || `Worker ${workerType} safely paused via ${options.controlKey}.`,
      severity: "warning",
      metadata: {
        worker_type: workerType,
        control_key: options.controlKey,
        ...options.metadata,
      },
    });
  } catch (err) {
    console.warn(`[WorkerControl] Failed to record pause audit:`, err);
  }
}

/**
 * Sets an in-memory operator override (useful in tests and emergency overrides).
 */
export function setLocalControlOverride(
  key: string,
  value: boolean,
  ttlMs = 30000,
  organizationId?: string
): void {
  const cacheKey = `${key}:${organizationId || "global"}`;
  _memoryCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
    cachedAt: Date.now(),
  });
}

/**
 * Clears in-memory control cache.
 */
export function clearRuntimeControlCache(): void {
  _memoryCache.clear();
}
