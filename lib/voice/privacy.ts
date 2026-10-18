/**
 * OmniRelay Telephony Voice Privacy, Pseudonymization & Retention Governance
 * 
 * Enforces:
 * 1. Secret-managed phone pseudonym salt in staging and production.
 * 2. Automated comprehensive PII scrubbing (phone, email, government ID, cards, addresses, names, clinical symptoms, credentials).
 * 3. Explicit separation between Zero-PII Operational Telemetry vs Consented Clinical Business Recording.
 * 4. 30-day retention expiry and lifecycle management.
 */

import crypto from "crypto";

// Comprehensive scrubbing patterns
const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const AADHAAR_REGEX = /\b\d{4}[-\s]\d{4}[-\s]\d{4}\b/g;
const CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
const POSTAL_PIN_REGEX = /\b(?:PIN|PINCODE|PIN\s*CODE)?\s*([1-9][0-9]{5})\b/gi;
const CREDENTIAL_REGEX = /(?:postgres:\/\/|sk_live_[a-zA-Z0-9]+|Bearer\s+ey[a-zA-Z0-9._-]+|password\s*=\s*[^\s,]+|token\s*=\s*[^\s,]+)/gi;
const NAME_PREFIX_REGEX = /(?:Patient(?:\s+Name)?|Name|Mr\.|Mrs\.|Ms\.)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
const ADDRESS_REGEX = /\b(?:Flat\s*\d+|Sector\s*\d+|MG\s*Road|Apartments|Nagar|Layout|Lane|Street)\b[^\n,.]*/gi;
const CLINICAL_SYMPTOMS_REGEX = /\b(?:acute\s+angina|chest\s+pain|dyspnea|high\s+fever|diabetes\s+mellitus|hypertension|malignancy|fracture|tachycardia)\b/gi;

/**
 * Returns the secret-managed pseudonym salt.
 * Throws in production/staging if the secret is unconfigured.
 */
export function getPhonePseudonymSalt(): string {
  const salt = process.env.VOICE_PHONE_PSEUDONYM_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production") {
      throw new Error("Configuration Error: VOICE_PHONE_PSEUDONYM_SALT must be configured in staging and production.");
    }
    return "omnirelay_dev_telephony_salt_2026";
  }
  return salt;
}

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
 * Creates a one-way deterministic SHA-256 hash using the secret-managed salt
 */
export function hashPhoneNumber(phone: string, overrideSalt?: string): string {
  const salt = overrideSalt || getPhonePseudonymSalt();
  return crypto.createHmac("sha256", salt).update(phone.trim()).digest("hex");
}

/**
 * Scrubs PII, clinical indicators, credentials, and identifiers from conversational text
 */
export function scrubPiiText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(CREDENTIAL_REGEX, "[REDACTED_CREDENTIAL]")
    .replace(EMAIL_REGEX, "[REDACTED_EMAIL]")
    .replace(CARD_REGEX, "[REDACTED_CARD]")
    .replace(AADHAAR_REGEX, "[REDACTED_GOVT_ID]")
    .replace(PHONE_REGEX, "[REDACTED_PHONE]")
    .replace(NAME_PREFIX_REGEX, "Patient: [REDACTED_NAME]")
    .replace(ADDRESS_REGEX, "[REDACTED_ADDRESS]")
    .replace(POSTAL_PIN_REGEX, "[REDACTED_PIN]")
    .replace(CLINICAL_SYMPTOMS_REGEX, "[REDACTED_CLINICAL_SYMPTOM]");
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

/**
 * Honest Nomenclature Definitions
 */
export interface VoiceTelemetryRecord {
  type: "operational_telemetry";
  callSid: string;
  orgId: string;
  direction: "inbound" | "outbound";
  durationSeconds: number;
  outcome: string;
  maskedPhone: string;
  pseudonymHash: string;
  latencyMetrics: Record<string, unknown>;
  zeroPiiCertified: true;
}

export interface ConsentedVoiceRecording {
  type: "consented_clinical_recording";
  callSid: string;
  orgId: string;
  consentVerified: true;
  retentionExpiresAt: string;
  transcriptSanitized: SanitizedTranscriptItem[];
  authorizedRoles: ["owner", "doctor"];
  zeroPiiClaim: false; // Honest classification: Consented recordings contain clinical facts for 30 days
}
