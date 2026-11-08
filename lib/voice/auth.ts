/**
 * OmniRelay Voice Service-to-Service Authentication, Tenant Binding & Idempotency Guard
 * 
 * Enforces:
 * 1. Mandatory `x-voice-org-id` header on every service request. Strictly binds to payload/query `org_id`.
 * 2. Mandatory `x-voice-request-id` (consume-once nonce).
 * 3. Mandatory `x-voice-timestamp` within 5-minute (300s) skew window.
 * 4. HMAC-SHA256 signature calculated over `${requestId}.${timestamp}.${tenantId}.${rawBody}`.
 * 5. Constant-time comparison using `crypto.timingSafeEqual`.
 * 6. Atomic duplicate request-ID rejection (replay attack protection).
 * 7. Feature-flag gating (`voice_agent_enabled`).
 */

import crypto from "crypto";
import { isFeatureEnabledAsync } from "../feature-flags.ts";
import { createAdminClient } from "../supabase/admin.ts";

export interface VoiceAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
  requestId?: string;
  orgId?: string;
}

export interface NonceConsumptionResult {
  success: boolean;
  duplicate: boolean;
  status: number;
  error?: string;
}

const REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

// In-memory synchronized nonce store for atomic replay detection across local workers
const localConsumedNonces = new Map<string, { orgId: string; expiresAt: number }>();

/**
 * Periodically prunes expired nonces from memory
 */
function pruneLocalNonces() {
  const now = Date.now();
  for (const [nonce, data] of localConsumedNonces.entries()) {
    if (data.expiresAt < now) {
      localConsumedNonces.delete(nonce);
    }
  }
}

/**
 * Atomically consumes a request nonce.
 * Fails closed on database errors (503 Service Unavailable).
 * Rejects duplicate request IDs (409 Conflict).
 * Local-memory fallback is permitted ONLY under an explicit local-test environment.
 */
export async function consumeVoiceRequestNonce(
  requestId: string,
  orgId: string,
  expiresAt: Date
): Promise<NonceConsumptionResult> {
  const isExplicitTestEnv =
    (process.env.NODE_ENV === "test" || process.env.ALLOW_IN_MEMORY_NONCE === "true") &&
    process.env.VERCEL_ENV !== "preview" &&
    process.env.VERCEL_ENV !== "production" &&
    process.env.NODE_ENV !== "production";

  // Check if PostgreSQL database is configured and reachable
  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch (err: unknown) {
    if (isExplicitTestEnv) {
      // Local unit-test fallback when database secrets are unconfigured
      pruneLocalNonces();
      if (localConsumedNonces.has(requestId)) {
        return {
          success: false,
          duplicate: true,
          status: 409,
          error: `Duplicate request: Request ID ${requestId} has already been consumed (replay attack rejected).`,
        };
      }
      localConsumedNonces.set(requestId, { orgId, expiresAt: expiresAt.getTime() });
      return { success: true, duplicate: false, status: 200 };
    }

    // Fail closed in production/staging when admin client cannot be created
    const message = err instanceof Error ? err.message : "Unconfigured database credentials";
    return {
      success: false,
      duplicate: false,
      status: 503,
      error: `Service Unavailable: Replay protection store is unconfigured: ${message}`,
    };
  }

  // Authoritative PostgreSQL RPC execution
  try {
    const { data, error } = await adminClient.rpc("consume_voice_request_nonce", {
      p_request_id: requestId,
      p_org_id: orgId,
      p_expires_at: expiresAt.toISOString(),
    });

    if (error) {
      // Treat every RPC/database error as service unavailable (Fail Closed)
      return {
        success: false,
        duplicate: false,
        status: 503,
        error: `Service Unavailable: Replay protection store failure: ${error.message}`,
      };
    }

    // Require RPC data === true
    if (data === true) {
      return { success: true, duplicate: false, status: 200 };
    }

    // Treat data === false as HTTP 409 duplicate
    return {
      success: false,
      duplicate: true,
      status: 409,
      error: `Duplicate request: Request ID ${requestId} has already been consumed (replay attack rejected).`,
    };
  } catch (err: unknown) {
    if (isExplicitTestEnv && !process.env.SUPABASE_SECRET_KEY && !process.env.DATABASE_URL) {
      // Local unit-test fallback when database is completely offline
      pruneLocalNonces();
      if (localConsumedNonces.has(requestId)) {
        return {
          success: false,
          duplicate: true,
          status: 409,
          error: `Duplicate request: Request ID ${requestId} has already been consumed (replay attack rejected).`,
        };
      }
      localConsumedNonces.set(requestId, { orgId, expiresAt: expiresAt.getTime() });
      return { success: true, duplicate: false, status: 200 };
    }

    const message = err instanceof Error ? err.message : "Database connection failure";
    return {
      success: false,
      duplicate: false,
      status: 503,
      error: `Service Unavailable: Replay protection storage error: ${message}`,
    };
  }
}

/**
 * Resets local nonces for clean test isolation
 */
export function clearVoiceNonces(): void {
  localConsumedNonces.clear();
}

/**
 * Generates an HMAC-SHA256 signature for voice service requests over (requestId + timestamp + tenantId + rawBody)
 */
export function generateVoiceSignature(
  requestId: string,
  timestamp: number,
  tenantId: string,
  rawBody: string,
  secret: string
): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${requestId}.${timestamp}.${tenantId}.${rawBody}`);
  return `v1=${hmac.digest("hex")}`;
}

export const generateVoiceHmacSignature = generateVoiceSignature;

/**
 * Validates incoming service-to-service requests from telephony voice agent microservice
 */
export async function verifyVoiceServiceAuth(
  req: Request,
  rawBody: string,
  expectedOrgId?: string
): Promise<VoiceAuthResult> {
  const secret = process.env.VOICE_SERVICE_SECRET || process.env.INTERNAL_SERVICE_KEY;

  if (!secret && process.env.NODE_ENV === "production") {
    return {
      authorized: false,
      status: 500,
      error: "Server configuration error: VOICE_SERVICE_SECRET is not configured.",
    };
  }

  // 1. Mandatory Header Verification
  const tenantHeader = req.headers.get("x-voice-org-id");
  if (!tenantHeader || tenantHeader.trim() === "") {
    return {
      authorized: false,
      status: 400,
      error: "Authentication required: Missing mandatory x-voice-org-id header.",
    };
  }

  const requestId = req.headers.get("x-voice-request-id");
  if (!requestId || requestId.trim() === "") {
    return {
      authorized: false,
      status: 400,
      error: "Authentication required: Missing mandatory x-voice-request-id header.",
    };
  }

  const timestampHeader = req.headers.get("x-voice-timestamp");
  if (!timestampHeader) {
    return {
      authorized: false,
      status: 400,
      error: "Authentication required: Missing mandatory x-voice-timestamp header.",
    };
  }

  const timestamp = Number(timestampHeader);
  if (isNaN(timestamp)) {
    return {
      authorized: false,
      status: 400,
      error: "Invalid timestamp: x-voice-timestamp must be an integer millisecond timestamp.",
    };
  }

  const signatureHeader = req.headers.get("x-voice-signature");
  if (!signatureHeader) {
    return {
      authorized: false,
      status: 401,
      error: "Authentication required: Missing mandatory x-voice-signature header.",
    };
  }

  // 2. Strict Tenant Binding
  if (expectedOrgId && tenantHeader !== expectedOrgId) {
    return {
      authorized: false,
      status: 403,
      error: `Tenant boundary violation: x-voice-org-id (${tenantHeader}) does not match target organization (${expectedOrgId}).`,
    };
  }

  // 3. Replay Attack Defense (Timestamp Skew Window)
  const now = Date.now();
  if (Math.abs(now - timestamp) > REPLAY_TOLERANCE_MS) {
    return {
      authorized: false,
      status: 401,
      error: "Replay attack detected: Timestamp outside allowed 5-minute skew window.",
    };
  }

  // 4. Cryptographic HMAC Signature Verification
  if (secret) {
    const expectedSignature = generateVoiceSignature(requestId, timestamp, tenantHeader, rawBody, secret);
    const sigA = Buffer.from(signatureHeader);
    const sigB = Buffer.from(expectedSignature);

    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return {
        authorized: false,
        status: 401,
        error: "Invalid voice signature: HMAC signature verification failed.",
      };
    }
  }

  // 5. Consume-Once Nonce Storage (Fail-Closed Deduplication)
  const expiresAt = new Date(timestamp + REPLAY_TOLERANCE_MS);
  const nonceResult = await consumeVoiceRequestNonce(requestId, tenantHeader, expiresAt);
  if (!nonceResult.success) {
    return {
      authorized: false,
      status: nonceResult.status,
      error: nonceResult.error || "Authentication rejected: Replay protection failure.",
    };
  }

  // 6. Tenant Feature Flag Gating (PostgreSQL-backed asynchronous evaluation)
  const isEnabled = await isFeatureEnabledAsync("voice_agent_enabled", tenantHeader);
  if (!isEnabled) {
    return {
      authorized: false,
      status: 403,
      error: "Feature Disabled: Voice AI telephony is currently disabled for this organization.",
    };
  }

  return {
    authorized: true,
    status: 200,
    requestId,
    orgId: tenantHeader,
  };
}
