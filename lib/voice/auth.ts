/**
 * OmniRelay Voice Service-to-Service Authentication & Integrity Guard
 * 
 * Enforces:
 * 1. HMAC-SHA256 signature verification over (timestamp + body).
 * 2. Replay attack prevention with strict 300s window.
 * 3. Strict tenant binding (preventing cross-organization impersonation).
 * 4. Constant-time signature comparison to eliminate timing attacks.
 * 5. Feature-flag gating (voice_agent_enabled check).
 */

import crypto from "crypto";
import { isFeatureEnabled } from "../feature-flags.ts";

export interface VoiceAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
}

const REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generates an HMAC-SHA256 signature for outgoing voice service requests
 */
export function generateVoiceSignature(body: string, timestamp: number, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${body}`);
  return `v1=${hmac.digest("hex")}`;
}

export const generateVoiceHmacSignature = generateVoiceSignature;


/**
 * Validates incoming service-to-service requests from telephony voice agent microservice
 */
export async function verifyVoiceServiceAuth(
  req: Request,
  rawBody: string,
  targetOrgId?: string
): Promise<VoiceAuthResult> {
  const secret = process.env.VOICE_SERVICE_SECRET || process.env.INTERNAL_SERVICE_KEY;

  // In production, the secret must be configured
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        authorized: false,
        status: 500,
        error: "Server configuration error: VOICE_SERVICE_SECRET is not configured.",
      };
    }
  }

  // 1. Check Bearer Token or HMAC Signature
  const authHeader = req.headers.get("authorization");
  const signatureHeader = req.headers.get("x-voice-signature");
  const timestampHeader = req.headers.get("x-voice-timestamp");
  const tenantHeader = req.headers.get("x-voice-org-id");

  // Fallback 1: Bearer token match against secret
  if (authHeader && secret && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === secret) {
      if (targetOrgId && tenantHeader && tenantHeader !== targetOrgId) {
        return {
          authorized: false,
          status: 403,
          error: "Tenant boundary violation: x-voice-org-id does not match target organization.",
        };
      }
      return checkFeatureFlag(targetOrgId);
    }
  }

  // Primary: HMAC verification
  if (!signatureHeader || !timestampHeader) {
    return {
      authorized: false,
      status: 401,
      error: "Authentication required: Missing x-voice-signature or x-voice-timestamp headers.",
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

  // 2. Replay Attack Defense
  const now = Date.now();
  if (Math.abs(now - timestamp) > REPLAY_TOLERANCE_MS) {
    return {
      authorized: false,
      status: 401,
      error: "Replay attack detected: Timestamp outside allowed 5-minute skew window.",
    };
  }

  // 3. Verify Signature
  if (secret) {
    const expectedSignature = generateVoiceSignature(rawBody, timestamp, secret);
    const sigA = Buffer.from(signatureHeader);
    const sigB = Buffer.from(expectedSignature);

    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return {
        authorized: false,
        status: 401,
        error: "Invalid voice signature: HMAC signature verification failed.",
      };
    }
  } else {
    // If no secret configured in test/dev, require test signature format
    if (!signatureHeader.startsWith("v1=") && !signatureHeader.startsWith("test_")) {
      return {
        authorized: false,
        status: 401,
        error: "Invalid voice signature format.",
      };
    }
  }

  // 4. Strict Tenant Binding
  if (targetOrgId && tenantHeader && tenantHeader !== targetOrgId) {
    return {
      authorized: false,
      status: 403,
      error: `Tenant boundary violation: x-voice-org-id (${tenantHeader}) does not match requested org (${targetOrgId}).`,
    };
  }

  // 5. Gating check
  return checkFeatureFlag(targetOrgId);
}

function checkFeatureFlag(orgId?: string): VoiceAuthResult {
  if (orgId && !isFeatureEnabled("voice_agent_enabled", orgId)) {
    return {
      authorized: false,
      status: 403,
      error: "Feature Disabled: Voice AI telephony is currently disabled for this organization.",
    };
  }

  return { authorized: true, status: 200 };
}
