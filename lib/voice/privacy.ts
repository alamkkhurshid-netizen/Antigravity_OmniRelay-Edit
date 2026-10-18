/**
 * OmniRelay Telephony Voice Privacy & Retention Governance
 * 
 * Enforces:
 * 1. Phone number hashing & masking (never store raw MSISDNs in analytics/telemetry).
 * 2. Automated PII scrubbing across transcripts & conversational summaries.
 * 3. Explicit retention lifecycle (30-day default expiry for voice telemetry).
 * 4. Consent verification before recording transcript text.
 */

import crypto from "crypto";

const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Masks phone number for safe display in UI/logs (e.g. "+91 9876543210" -> "+91-XXXXX-3210")
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "ANONYMOUS";
  const clean = phone.replace(/[^0-9+]/g, "");
  if (clean.length < 6) return "REDACTED";
  const last4 = clean.slice(-4);
  const prefix = clean.startsWith("+") ? clean.slice(0, 3) : "+91";
  return `${prefix}-XXXXX-${last4}`;
}

/**
 * Creates a one-way deterministic SHA-256 hash of a phone number for repeat-caller detection
 */
export function hashPhoneNumber(phone: string, salt: string = "omnirelay_telephony_salt"): string {
  return crypto.createHmac("sha256", salt).update(phone.trim()).digest("hex");
}

/**
 * Scrubs PII (phone numbers, email addresses) from conversational text
 */
export function scrubPiiText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(EMAIL_REGEX, "[REDACTED_EMAIL]")
    .replace(PHONE_REGEX, "[REDACTED_PHONE]");
}

export interface SanitizedTranscriptItem {
  speaker: "caller" | "agent" | "system";
  text: string;
  timestamp?: string;
}

/**
 * Sanitizes and enforces consent for call transcripts
 */
export function sanitizeTranscript(
  transcript: unknown[],
  consentRecorded: boolean = false
): SanitizedTranscriptItem[] {
  // If consent was not explicitly recorded, do not persist conversational transcripts
  if (!consentRecorded) {
    return [
      {
        speaker: "system",
        text: "[TRANSCRIPT_OMITTED_ZERO_RETENTION_POLICY: Patient recording consent not recorded]",
      },
    ];
  }

  if (!Array.isArray(transcript)) return [];

  return transcript.map((rawItem: unknown) => {
    const item = (rawItem && typeof rawItem === "object") ? (rawItem as Record<string, unknown>) : {};
    return {
      speaker: item.speaker === "caller" || item.speaker === "agent" ? item.speaker : "system",
      text: scrubPiiText(String(item.text || item.content || "")),
      timestamp: String(item.timestamp || new Date().toISOString()),
    };
  });
}

/**
 * Calculates retention expiry date for voice call logs (default: 30 days)
 */
export function calculateRetentionExpiry(days: number = 30): string {
  const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return expiry.toISOString();
}
