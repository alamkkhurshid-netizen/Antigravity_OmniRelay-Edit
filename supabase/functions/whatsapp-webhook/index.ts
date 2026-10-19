import type { SupabaseClient } from "@supabase/supabase-js";
import * as log from "../_shared/logger.ts";
import { createUnsecureClient } from "../_shared/supabase_client.ts";
import { whatsappToMarkdown } from "../_shared/markdown.ts";
import type { MetaWebhookPayload } from "../_shared/types/whatsapp_webhook_payload_types.ts";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || Deno.env.get("META_VERIFY_TOKEN") || "omnirelay_verify_token";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") || Deno.env.get("META_APP_SECRET") || "omnirelay_app_secret";
const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MB payload bound

/**
 * Constant-time string equality check to prevent HMAC timing side-channels.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Validates Meta GET webhook verification challenge.
 * Boundary 1: Meta GET verification
 */
function handleGetVerification(request: Request): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    log.info("Meta webhook GET verification challenge succeeded");
    return new Response(challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  log.warn("Meta webhook GET verification failed: token or mode mismatch", {
    mode,
    hasToken: Boolean(token),
  });
  return new Response("Verification failed", { status: 403 });
}

/**
 * Validates the HMAC-SHA256 signature against the raw request body using constant-time comparison.
 * Boundary 2: HMAC verification against raw request
 */
async function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!APP_SECRET) {
    log.warn("META_APP_SECRET environment variable is not configured");
    return false;
  }

  if (!signatureHeader) {
    log.warn("Missing X-Hub-Signature-256 header on incoming webhook");
    return false;
  }

  const signatureValue = signatureHeader.replace(/^sha256=/, "").trim().toLowerCase();
  const secrets = APP_SECRET.split("|").map((s) => s.trim()).filter(Boolean);

  const encoder = new TextEncoder();
  const data = encoder.encode(rawBody);

  for (const secret of secrets) {
    try {
      const keyBytes = encoder.encode(secret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );

      const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        data,
      );
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toLowerCase();

      if (constantTimeEqual(expectedSignature, signatureValue)) {
        return true;
      }
    } catch (err) {
      log.error(
        "Error computing HMAC-SHA256 signature",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  log.warn("Invalid HMAC-SHA256 signature on incoming webhook");
  return false;
}

interface TenantResolution {
  organization_id: string;
  connection_id?: string;
  display_address?: string;
}

/**
 * Strict tenant resolution through channel_connections (primary),
 * with safe fallback to organizations_addresses only while reconciling legacy records.
 * Boundary 3 & 4: Recipient phone_number_id extraction & Tenant resolution
 */
async function resolveTenant(
  client: SupabaseClient,
  phoneNumberId: string,
  wabaId?: string,
): Promise<TenantResolution | null> {
  // 1. Strict primary lookup: channel_connections by external_phone_number_id
  const { data: conn } = await client
    .from("channel_connections")
    .select("id, organization_id, status, external_phone_number_id, display_address")
    .eq("channel", "whatsapp")
    .eq("external_phone_number_id", phoneNumberId)
    .in("status", ["live", "test", "pending"])
    .maybeSingle();

  if (conn?.organization_id) {
    return {
      organization_id: conn.organization_id,
      connection_id: conn.id,
      display_address: conn.display_address || phoneNumberId,
    };
  }

  // 2. Safe secondary lookup: channel_connections by external_account_id (waba_id)
  if (wabaId) {
    const { data: wabaConn } = await client
      .from("channel_connections")
      .select("id, organization_id, status, external_phone_number_id, display_address")
      .eq("channel", "whatsapp")
      .eq("external_account_id", wabaId)
      .in("status", ["live", "test", "pending"])
      .maybeSingle();

    if (wabaConn?.organization_id) {
      return {
        organization_id: wabaConn.organization_id,
        connection_id: wabaConn.id,
        display_address: wabaConn.display_address || phoneNumberId,
      };
    }
  }

  // 3. Safe fallback only while reconciling legacy records: organizations_addresses
  const { data: orgAddr } = await client
    .from("organizations_addresses")
    .select("organization_id, address, status, extra")
    .eq("service", "whatsapp")
    .eq("address", phoneNumberId)
    .maybeSingle();

  if (orgAddr?.organization_id) {
    return {
      organization_id: orgAddr.organization_id,
      display_address: orgAddr.address,
    };
  }

  return null;
}

/**
 * Formats incoming WhatsApp webhook message to canonical content structure.
 * Note: Never log raw message content or customer identifiers.
 */
function parseMessageContent(msg: Record<string, unknown>): {
  type: string;
  kind: string;
  text?: string;
  data?: unknown;
  file?: unknown;
} {
  const type = String(msg.type || "text");

  switch (type) {
    case "text": {
      const textBody = (msg.text as { body?: string })?.body || "";
      return {
        type: "text",
        kind: "text",
        text: whatsappToMarkdown(textBody),
      };
    }

    case "interactive": {
      const interactive = msg.interactive as {
        button_reply?: { title?: string; id?: string };
        list_reply?: { title?: string; id?: string };
      };
      const title =
        interactive?.button_reply?.title ||
        interactive?.list_reply?.title ||
        interactive?.button_reply?.id ||
        interactive?.list_reply?.id ||
        "";
      return {
        type: "data",
        kind: "interactive",
        text: title,
        data: interactive,
      };
    }

    case "button": {
      const button = msg.button as { text?: string; payload?: string };
      return {
        type: "data",
        kind: "button",
        text: button?.text || button?.payload || "",
        data: button,
      };
    }

    case "reaction": {
      const reaction = msg.reaction as { emoji?: string; message_id?: string };
      return {
        type: "text",
        kind: "reaction",
        text: reaction?.emoji || "",
        data: { message_id: reaction?.message_id },
      };
    }

    case "image": {
      const image = msg.image as {
        caption?: string;
        mime_type?: string;
        id?: string;
      };
      return {
        type: "file",
        kind: "image",
        text: image?.caption ? whatsappToMarkdown(image.caption) : undefined,
        file: {
          mime_type: image?.mime_type,
          uri: image?.id,
          size: 0,
        },
      };
    }

    case "audio": {
      const audio = msg.audio as { mime_type?: string; id?: string };
      return {
        type: "file",
        kind: "audio",
        file: {
          mime_type: audio?.mime_type,
          uri: audio?.id,
          size: 0,
        },
      };
    }

    case "video": {
      const video = msg.video as {
        caption?: string;
        mime_type?: string;
        id?: string;
      };
      return {
        type: "file",
        kind: "video",
        text: video?.caption ? whatsappToMarkdown(video.caption) : undefined,
        file: {
          mime_type: video?.mime_type,
          uri: video?.id,
          size: 0,
        },
      };
    }

    case "document": {
      const doc = msg.document as {
        caption?: string;
        filename?: string;
        mime_type?: string;
        id?: string;
      };
      return {
        type: "file",
        kind: "document",
        text: doc?.caption ? whatsappToMarkdown(doc.caption) : undefined,
        file: {
          name: doc?.filename,
          mime_type: doc?.mime_type,
          uri: doc?.id,
          size: 0,
        },
      };
    }

    case "location": {
      return {
        type: "data",
        kind: "location",
        data: msg.location,
      };
    }

    case "contacts": {
      return {
        type: "data",
        kind: "contacts",
        data: msg.contacts,
      };
    }

    default:
      return {
        type: "data",
        kind: "unsupported",
        data: msg,
      };
  }
}

/**
 * Idempotent delivery, read, and failure status reconciliation.
 * Boundary 7: Delivery/read/failure status reconciliation
 * Note: Never log raw recipient numbers or customer identifiers.
 */
async function processStatusReconciliation(
  client: SupabaseClient,
  statuses: Array<{
    id: string;
    status: string;
    timestamp: string;
    recipient_id?: string;
    errors?: Array<{ code: number; title: string; message: string }>;
  }>,
) {
  for (const st of statuses) {
    const timestampMs = parseInt(st.timestamp, 10) * 1000;
    const statusTimestamp = new Date(
      isNaN(timestampMs) ? Date.now() : timestampMs,
    ).toISOString();
    const providerStatus = st.status.toLowerCase();
    const providerMessageId = st.id;

    log.info("Idempotent status reconciliation", {
      providerMessageId,
      status: providerStatus,
    });

    // 1. Reconcile on messages table
    const statusPatch: Record<string, unknown> = {
      [providerStatus]: statusTimestamp,
    };
    if (st.errors) {
      statusPatch.errors = st.errors;
    }

    await client
      .from("messages")
      .update({ status: statusPatch })
      .eq("external_id", providerMessageId);

    // 2. Reconcile on reminder_events
    const isFailure = providerStatus === "failed";
    const reminderStatus = isFailure ? "failed" : "sent";

    const reminderUpdate: Record<string, unknown> = {
      provider_message_id: providerMessageId,
      status: reminderStatus,
      updated_at: new Date().toISOString(),
    };

    if (providerStatus === "sent") {
      reminderUpdate.sent_at = statusTimestamp;
    } else if (providerStatus === "delivered") {
      reminderUpdate.delivered_at = statusTimestamp;
    } else if (providerStatus === "read") {
      reminderUpdate.read_at = statusTimestamp;
    } else if (isFailure) {
      reminderUpdate.failure_reason =
        st.errors?.[0]?.message || "WhatsApp delivery failed";
    }

    await client
      .from("reminder_events")
      .update(reminderUpdate)
      .eq("provider_message_id", providerMessageId);

    // 3. Reconcile on care_reminder_runs
    await client
      .from("care_reminder_runs")
      .update({
        status: isFailure ? "failed" : providerStatus,
        ...(providerStatus === "delivered"
          ? { delivered_at: statusTimestamp }
          : {}),
        ...(providerStatus === "read" ? { read_at: statusTimestamp } : {}),
        ...(isFailure
          ? {
            failure_reason:
              st.errors?.[0]?.message || "WhatsApp delivery failed",
          }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("provider_message_id", providerMessageId);

    // 4. Reconcile on doctor_queue_dispatches
    await client
      .from("doctor_queue_dispatches")
      .update({
        status: isFailure ? "failed" : providerStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_message_id", providerMessageId);
  }
}

/**
 * Main Webhook Handler
 */
Deno.serve(async (request: Request) => {
  // Boundary 1: Meta GET verification
  if (request.method === "GET") {
    return handleGetVerification(request);
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Bounded payload size check
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    log.warn("Webhook rejected: payload size exceeds 1 MB limit", { contentLength });
    return new Response("Payload Too Large", { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_PAYLOAD_BYTES) {
    log.warn("Webhook rejected: raw body length exceeds 1 MB limit", { length: rawBody.length });
    return new Response("Payload Too Large", { status: 413 });
  }

  const signatureHeader = request.headers.get("X-Hub-Signature-256");

  // Boundary 2: Constant-time HMAC verification against the raw request
  const isValidSignature = await verifyHmacSignature(
    rawBody,
    signatureHeader,
  );
  if (!isValidSignature) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Explicit handling for malformed payloads
  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
    if (!payload || typeof payload !== "object") {
      throw new Error("Payload is not a valid JSON object");
    }
  } catch (err) {
    log.warn("Malformed Meta webhook JSON body rejected", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response("Bad Request", { status: 400 });
  }

  if (payload.object !== "whatsapp_business_account") {
    return new Response("Ignored non-WABA object", { status: 200 });
  }

  const client = createUnsecureClient();

  for (const entry of payload.entry || []) {
    const wabaId = entry.id;

    for (const change of entry.changes || []) {
      const field = change.field;
      const val = change.value as Record<string, unknown> | undefined;

      if (!val || typeof val !== "object") {
        continue;
      }

      // Handle coexistence account updates
      if (field === "account_update") {
        const eventType = String(val.event || "");
        log.info("Received WhatsApp account_update event", {
          wabaId,
          event: eventType,
        });

        if (
          eventType === "PARTNER_REMOVED" ||
          eventType === "ACCOUNT_OFFBOARDED"
        ) {
          await client
            .from("channel_connections")
            .update({
              status: "disabled",
              last_error: `Account ${eventType}`,
              updated_at: new Date().toISOString(),
            })
            .eq("external_account_id", wabaId);

          await client
            .from("organizations_addresses")
            .update({ status: "disconnected" })
            .eq("extra->>waba_id", wabaId);
        } else if (eventType === "ACCOUNT_RECONNECTED") {
          await client
            .from("channel_connections")
            .update({
              status: "live",
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("external_account_id", wabaId);

          await client
            .from("organizations_addresses")
            .update({ status: "connected" })
            .eq("extra->>waba_id", wabaId);
        }
        continue;
      }

      // Boundary 3: Recipient phone_number_id extraction
      const metadata = val.metadata as
        | { phone_number_id?: string; display_phone_number?: string }
        | undefined;
      const phoneNumberId = metadata?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      // Boundary 4: Strict tenant resolution through channel_connections (with legacy fallback)
      const tenant = await resolveTenant(client, phoneNumberId, wabaId);
      if (!tenant) {
        log.warn("Unresolved tenant for incoming WhatsApp webhook; logging operational event", {
          recipientPhoneNumberId: phoneNumberId,
          wabaId,
        });

        // Durable operational event for unmapped recipient IDs (nullable platform-level event)
        await client.from("operational_events").insert({
          organization_id: null,
          event_source: "whatsapp_webhook",
          severity: "warning",
          error_code: "ROUTING_UNMAPPED_RECIPIENT",
          safe_message: "Inbound WhatsApp webhook received for unmapped recipient phone_number_id.",
          metadata: {
            recipient_phone_number_id: phoneNumberId,
            waba_id: wabaId,
          },
        });
        continue;
      }

      // Boundary 7: Idempotent status reconciliation
      if (Array.isArray(val.statuses) && val.statuses.length > 0) {
        await processStatusReconciliation(client, val.statuses);
      }

      // Extract contact profile name mapping (sanitized, in-memory only)
      const contacts = (val.contacts as Array<{
        wa_id?: string;
        user_id?: string;
        profile?: { name?: string };
      }>) || [];

      const contactNameMap = new Map<string, string>();
      for (const c of contacts) {
        const addr = c.wa_id || c.user_id;
        if (addr && c.profile?.name) {
          contactNameMap.set(addr, c.profile.name);
        }
      }

      // Boundary 5 & 6: Atomic inbound message ingestion via PostgreSQL RPC
      // One message ID -> one row -> one concierge dispatch
      const incomingMessages = (val.messages as Array<
        Record<string, unknown>
      >) || [];

      for (const msg of incomingMessages) {
        const messageId = String(msg.id || "");
        if (!messageId) continue;

        const fromAddress = String(msg.from || "");
        const contactName = contactNameMap.get(fromAddress);
        const parsedContent = parseMessageContent(msg);

        const msgTimestamp = parseInt(String(msg.timestamp || ""), 10) * 1000;
        const timestampIso = new Date(
          isNaN(msgTimestamp) ? Date.now() : msgTimestamp,
        ).toISOString();

        // Atomic ingestion via service-role PostgreSQL RPC
        const { data: ingestResult, error: ingestError } = await client.rpc(
          "ingest_inbound_whatsapp_message",
          {
            p_phone_number_id: phoneNumberId,
            p_waba_id: wabaId,
            p_provider_message_id: messageId,
            p_sender_phone: fromAddress,
            p_sender_name: contactName || null,
            p_content: {
              version: "1",
              ...parsedContent,
            },
            p_occurred_at: timestampIso,
          },
        );

        if (ingestError) {
          // On transient database failure, return HTTP 500 so Meta retries
          log.error("Transient error during atomic message ingestion; returning 500 for Meta retry", {
            providerMessageId: messageId,
            error: ingestError.message,
          });
          return new Response("Database Error", { status: 500 });
        }

        if (ingestResult?.inserted) {
          log.info("Persisted canonical incoming WhatsApp message", {
            providerMessageId: messageId,
            organizationId: tenant.organization_id,
            messageType: parsedContent.type,
          });
        } else {
          log.info("Duplicate or existing incoming message skipped", {
            providerMessageId: messageId,
            reason: ingestResult?.reason,
          });
        }
      }
    }
  }

  return new Response("OK", { status: 200 });
});
