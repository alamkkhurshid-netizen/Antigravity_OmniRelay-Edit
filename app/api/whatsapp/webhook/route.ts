import { NextResponse } from "next/server";
import { supabaseUrl } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

function equalBytes(left:Uint8Array,right:Uint8Array) {
  if(left.length!==right.length)return false;
  let difference=0;
  for(let index=0;index<left.length;index++)difference|=left[index]^right[index];
  return difference===0;
}
async function validSignature(body:string,signature:string,secret:string) {
  if(!signature.startsWith("sha256="))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
  const received=Uint8Array.from((signature.slice(7).match(/.{1,2}/g)??[]).map((value)=>Number.parseInt(value,16)));
  return equalBytes(digest,received);
}
async function adminUpdate(providerMessageId:string,status:string,timestamp?:string) {
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)return;
  const patch:Record<string,unknown>={status,status_provider:status,updated_at:new Date().toISOString()};
  if(status==="sent")patch.sent_at=timestamp?new Date(Number(timestamp)*1000).toISOString():new Date().toISOString();
  if(status==="delivered")patch.delivered_at=timestamp?new Date(Number(timestamp)*1000).toISOString():new Date().toISOString();
  if(status==="read")patch.read_at=timestamp?new Date(Number(timestamp)*1000).toISOString():new Date().toISOString();
  if(status==="failed")patch.status="failed";
  else patch.status="sent";
  delete patch.status_provider;
  const adminClient = createAdminClient();
  try {
    const { error } = await adminClient
      .from("reminder_events")
      .update(patch)
      .eq("provider_message_id", providerMessageId);
      
    if (error) throw error;
  } catch (error) {
    console.error("[Webhook] Failed to update delivery status in Supabase:", error);
  }

  // Active Billing Deduction Check (Inactive by default)
  if (process.env.ENABLE_ACTIVE_BILLING === "true" && (status === "sent" || status === "delivered")) {
    try {
      // 1. We need to look up the organization_id from the reminder event
      const { data: events, error: fetchError } = await adminClient
        .from("reminder_events")
        .select("organization_id,event_type")
        .eq("provider_message_id", providerMessageId);
        
      if (fetchError) throw fetchError;
      
      if (events && events.length > 0) {
        const orgId = events[0].organization_id;
        // For now, reminder events are all 'utility' category.
        const category = "utility"; 
        
        // 2. Execute the atomic deduction RPC
        const { error: rpcError } = await adminClient.rpc("record_and_deduct", {
          p_organization_id: orgId,
          p_meta_message_id: providerMessageId,
          p_category: category
        });
        if (rpcError) throw rpcError;
      }
    } catch (e) {
      console.error("Active Billing Deduction failed:", e);
    }
  }
}

// Intercept Super CTO approvals from the founder
async function processSuperCtoApproval(from: string, messageBody: string) {
  const founderNumber = process.env.FOUNDER_WHATSAPP_NUMBER;
  if (!founderNumber || from !== founderNumber) return false;

  const match = messageBody.trim().match(/^APPROVE\s+([a-zA-Z0-9-]+)$/i);
  if (!match) return false;

  const queueId = match[1];
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return true;

  try {
    // Mark as approved in Supabase
    const adminClient = createAdminClient();
    const { data: updatedRows, error } = await adminClient
      .from("ai_governance_queue")
      .update({ status: "approved" })
      .eq("id", queueId)
      .select();

    if (!error && updatedRows && updatedRows.length > 0) {
      console.log(`[Super CTO] Patch ${queueId} approved by founder! Triggering deployment...`);
      
      const patchData = updatedRows[0];

      // Trigger GitHub Action Deployment Engine
      const githubRepo = process.env.GITHUB_REPO; // e.g. "username/repo"
      const githubToken = process.env.GITHUB_PAT;
      
      if (githubRepo && githubToken && patchData) {
        try {
          await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
            method: "POST",
            headers: {
              "Accept": "application/vnd.github.v3+json",
              "Authorization": `token ${githubToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              event_type: "super-cto-deploy",
              client_payload: {
                queue_id: queueId,
                affected_files: patchData.affected_files,
                proposed_patch: patchData.proposed_patch
              }
            })
          });
          console.log(`[Super CTO] Successfully dispatched to GitHub Actions!`);
        } catch (githubErr) {
          console.error(`[Super CTO] Failed to trigger GitHub Action:`, githubErr);
        }
      }
      
      // Send confirmation back to founder
      const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
      const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN;
      if (phoneNumberId && systemToken) {
        await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${systemToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: founderNumber,
            type: "text",
            text: { body: `✅ Patch ${queueId} has been approved! The deployment engine has been triggered.` }
          })
        });
      }
    }
  } catch (err) {
    console.error("[Super CTO] Failed to process approval:", err);
  }

  return true; // We handled it, don't forward to Hermes
}

// Forward inbound customer messages to the Hermes Agent via strict tenant routing
async function forwardInboundMessage(
  from: string, 
  messageBody: string, 
  messageType: string,
  waId: string,
  profileName: string | undefined,
  ref: string | undefined,
  recipientPhoneId?: string,
  messageId?: string
) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return;

  const adminClient = createAdminClient();

  // 1. Strict Multi-Tenant Match: Look up clinic EXCLUSIVELY by Meta's recipient phone_number_id
  if (!recipientPhoneId) {
    console.error(`[WhatsApp Routing] Missing receiving phone_number_id from Meta webhook. Quarantining message from ${from}.`);
    await adminClient.from("operational_events").insert({
      event_source: "whatsapp_routing",
      severity: "warning",
      error_code: "ROUTING_MISSING_RECIPIENT_ID",
      safe_message: `Inbound WhatsApp message quarantined: missing receiving phone_number_id.`,
      metadata: { from, message_type: messageType, message_id: messageId }
    });
    return;
  }

  const { data: conns, error: connError } = await adminClient
    .from("whatsapp_connections")
    .select("organization_id")
    .eq("phone_number_id", recipientPhoneId);

  if (connError || !conns || conns.length === 0) {
    console.warn(`[WhatsApp Routing] Unmapped recipient phone_number_id ${recipientPhoneId}. Quarantining message from ${from}.`);
    await adminClient.from("operational_events").insert({
      event_source: "whatsapp_routing",
      severity: "warning",
      error_code: "ROUTING_UNMAPPED_RECIPIENT",
      safe_message: `Unmapped WhatsApp recipient phone_number_id (${recipientPhoneId}). Message quarantined.`,
      metadata: { from, recipient_phone_id: recipientPhoneId, message_type: messageType, message_id: messageId }
    });
    return;
  }

  if (conns.length > 1) {
    console.error(`[WhatsApp Routing] Ambiguous configuration: multiple tenants share phone_number_id ${recipientPhoneId}. Quarantining.`);
    await adminClient.from("operational_events").insert({
      event_source: "whatsapp_routing",
      severity: "critical",
      error_code: "ROUTING_AMBIGUOUS_RECIPIENT",
      safe_message: `Ambiguous WhatsApp recipient mapping: ${conns.length} tenants share phone_number_id (${recipientPhoneId}).`,
      metadata: { from, recipient_phone_id: recipientPhoneId, matched_orgs: conns.map(c => c.organization_id), message_id: messageId }
    });
    return;
  }

  const orgId = conns[0].organization_id;

  // 2. Durable Inbound Message Lifecycle & Atomic Deduplication
  // Lifecycle: received -> queued -> processing -> completed / failed
  let shouldProcess = true;
  if (messageId) {
    // Attempt atomic insert
    const { error: insertErr } = await adminClient
      .from("whatsapp_inbound_messages")
      .insert({
        organization_id: orgId,
        provider_message_id: messageId,
        recipient_phone_id: recipientPhoneId,
        sender_phone: from,
        status: "processing",
        message_type: messageType,
        payload: { message_body: messageBody, profile_name: profileName, ref }
      });

    if (insertErr) {
      // Row already exists (duplicate delivery or retry from Meta)
      const { data: existingRow } = await adminClient
        .from("whatsapp_inbound_messages")
        .select("id, status, retry_count, updated_at")
        .eq("provider_message_id", messageId)
        .maybeSingle();

      if (existingRow) {
        if (existingRow.status === "completed") {
          console.log(`[WhatsApp Webhook] Message ${messageId} already completed. Idempotent skip.`);
          return;
        }

        const updatedAt = new Date(existingRow.updated_at || 0).getTime();
        const now = Date.now();
        // If actively processing within the last 60 seconds, avoid concurrent double-dispatch
        if (existingRow.status === "processing" && (now - updatedAt) < 60000) {
          console.log(`[WhatsApp Webhook] Message ${messageId} is currently in flight. Skipping duplicate concurrent callback.`);
          return;
        }

        // Status is 'failed' or stalled: allow safe retry
        console.log(`[WhatsApp Webhook] Retrying previously ${existingRow.status} message ${messageId}. Attempt ${existingRow.retry_count + 1}`);
        await adminClient
          .from("whatsapp_inbound_messages")
          .update({
            status: "processing",
            retry_count: (existingRow.retry_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq("provider_message_id", messageId);
      }
    }
  }

  // 3. Forward to Hermes Agent
  const hermesUrl = process.env.HERMES_AGENT_URL || (process.env.NODE_ENV === "production" ? null : "http://localhost:8000/api/v1/agent/invoke");
  if (!hermesUrl) {
    console.warn("[Webhook] HERMES_AGENT_URL is not configured. Skipping AI agent invocation.");
    if (messageId) {
      await adminClient
        .from("whatsapp_inbound_messages")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("provider_message_id", messageId);
    }
    return;
  }

  const hermesPayload = {
    user_id: `whatsapp_${waId}`,
    session_id: `${orgId}-whatsapp-${waId}`,
    message: messageBody,
    context: {
      workspace_id: orgId,
      payload_type: "inbound_whatsapp",
      customer_phone: from,
      customer_name: profileName || "Unknown",
      message_type: messageType,
      referral_ref: ref || null
    }
  };

  try {
    const res = await fetch(hermesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hermesPayload)
    });

    if (!res.ok) {
      throw new Error(`Hermes agent invocation HTTP error ${res.status}`);
    }

    // Downstream processing succeeded: mark completed
    if (messageId) {
      await adminClient
        .from("whatsapp_inbound_messages")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("provider_message_id", messageId);
    }
  } catch (err: any) {
    console.error("[Webhook → Hermes] Failed to forward inbound message:", err);
    // Mark failed so subsequent Meta retries can recover processing
    if (messageId) {
      await adminClient
        .from("whatsapp_inbound_messages")
        .update({
          status: "failed",
          error_message: err.message || "Failed to forward to agent",
          updated_at: new Date().toISOString()
        })
        .eq("provider_message_id", messageId);
    }
  }
}

export async function GET(request:Request) {
  const url=new URL(request.url);
  const mode=url.searchParams.get("hub.mode");
  const token=url.searchParams.get("hub.verify_token");
  const challenge=url.searchParams.get("hub.challenge");
  if(mode==="subscribe"&&token&&challenge&&token===process.env.WHATSAPP_VERIFY_TOKEN)return new Response(challenge,{status:200});
  return new Response("Verification failed",{status:403});
}

export async function POST(request:Request) {
  const body=await request.text();
  const signature=request.headers.get("x-hub-signature-256")??"";
  const appSecret=process.env.WHATSAPP_APP_SECRET;
  if(!appSecret||!(await validSignature(body,signature,appSecret)))return NextResponse.json({error:"Invalid signature"},{status:401});
  
  const payload = JSON.parse(body) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: {display_phone_number?: string; phone_number_id?: string};
          statuses?: Array<{id?: string; status?: string; timestamp?: string}>;
          messages?: Array<{
            from?: string;
            id?: string;
            timestamp?: string;
            type?: string;
            text?: {body?: string};
            button?: {text?: string; payload?: string};
            interactive?: {button_reply?: {id?: string; title?: string}; list_reply?: {id?: string; title?: string}};
            referral?: {ref?: string; source_url?: string; source_type?: string};
          }>;
          contacts?: Array<{profile?: {name?: string}; wa_id?: string}>;
        };
      }>;
    }>;
  };

  // 1. Process delivery status updates (existing logic)
  const statuses = payload.entry?.flatMap(entry => 
    entry.changes?.flatMap(change => change.value?.statuses ?? []) ?? []
  ) ?? [];
  await Promise.all(
    statuses.filter(item => item.id && item.status).map(item => adminUpdate(item.id!, item.status!, item.timestamp))
  );

  // 2. Process INBOUND messages (NEW — fixes the "deaf webhook")
  const entries = payload.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;

      const contacts = value.contacts ?? [];
      const recipientPhoneId = value.metadata?.phone_number_id;

      for (const msg of value.messages) {
        if (!msg.from || !msg.type) continue;

        // Extract message body based on type
        let messageBody = "";
        if (msg.type === "text" && msg.text?.body) {
          messageBody = msg.text.body;
        } else if (msg.type === "button" && msg.button?.text) {
          messageBody = msg.button.text;
        } else if (msg.type === "interactive") {
          messageBody = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "[Interactive response]";
        } else {
          messageBody = `[${msg.type} message received]`;
        }

        // Extract contact profile
        const contact = contacts.find(c => c.wa_id === msg.from);
        const profileName = contact?.profile?.name;

        // Extract deep link ref from Meta Ad click-throughs
        const ref = msg.referral?.ref;

        // Check if this is a Super CTO approval from the founder
        const isCtoCommand = await processSuperCtoApproval(msg.from, messageBody);
        if (isCtoCommand) continue;

        // Forward to Hermes Agent with strict recipient phone_number_id tenant routing & deduplication
        await forwardInboundMessage(msg.from, messageBody, msg.type, msg.from, profileName, ref, recipientPhoneId, msg.id);
      }
    }
  }

  return NextResponse.json({received:true});
}
