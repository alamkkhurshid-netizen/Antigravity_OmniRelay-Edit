import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { supabase, organization } = await getWorkspace();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

    const payload = await request.json().catch(() => ({})) as {
      phone?: string;
      name?: string;
      text?: string;
    };

    const rawPhone = String(payload.phone ?? "").trim();
    const text = String(payload.text ?? "").trim();
    const name = String(payload.name ?? "Patient").trim();

    if (!rawPhone) {
      return NextResponse.json({ error: "Patient phone number is required." }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }

    // Normalize phone number to E.164 without leading plus
    let cleanPhone = rawPhone.replace(/\D/g, "");
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) cleanPhone = `91${cleanPhone.slice(1)}`;

    const admin = createAdminClient();

    // 1. Get WhatsApp Connection
    const { data: connection } = await admin
      .from("channel_connections")
      .select("external_phone_number_id,status,display_address")
      .eq("organization_id", organization.id)
      .eq("channel", "whatsapp")
      .maybeSingle();

    if (!connection?.external_phone_number_id) {
      return NextResponse.json({ error: "WhatsApp channel is not connected." }, { status: 400 });
    }

    const phoneId = connection.external_phone_number_id;

    // Resolve Access Token
    let accessToken: string | null = null;
    try {
      const { data: vaultToken } = await admin.rpc("get_whatsapp_access_token", {
        p_organization_id: organization.id,
        p_phone_number_id: phoneId,
      });
      if (typeof vaultToken === "string" && vaultToken.length > 0) {
        accessToken = vaultToken;
      }
    } catch {}

    if (!accessToken) {
      const { data: addrRow } = await admin
        .from("organizations_addresses")
        .select("extra")
        .eq("organization_id", organization.id)
        .eq("service", "whatsapp")
        .or(`address.eq.${phoneId},status.eq.connected`)
        .maybeSingle();

      const extra = addrRow?.extra as { access_token?: string } | null;
      accessToken = extra?.access_token || process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.WHATSAPP_SYSTEM_TOKEN || null;
    }

    if (!accessToken) {
      return NextResponse.json({ error: "WhatsApp credentials not available." }, { status: 502 });
    }

    // 2. Find or Create Conversation
    let { data: conversation } = await admin
      .from("conversations")
      .select("id,organization_id,service,organization_address,contact_address,status")
      .eq("organization_id", organization.id)
      .eq("service", "whatsapp")
      .or(`contact_address.eq.${cleanPhone},contact_address.eq.${rawPhone}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error: convError } = await admin
        .from("conversations")
        .insert({
          organization_id: organization.id,
          service: "whatsapp",
          organization_address: phoneId,
          contact_address: cleanPhone,
          name,
          status: "active",
        })
        .select("id,organization_id,service,organization_address,contact_address,status")
        .single();

      if (convError || !newConv) {
        return NextResponse.json({ error: "Could not initialize patient conversation." }, { status: 500 });
      }
      conversation = newConv;
    }

    // 3. Check 24-hour Service Window
    const { data: latestIncoming } = await admin
      .from("messages")
      .select("timestamp")
      .eq("organization_id", organization.id)
      .eq("conversation_id", conversation.id)
      .eq("direction", "incoming")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    const incomingAt = latestIncoming?.timestamp ? new Date(latestIncoming.timestamp).getTime() : Number.NaN;
    const serviceWindowOpen = Number.isFinite(incomingAt) && Date.now() - incomingAt < 24 * 60 * 60 * 1000;

    const graphVersion = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";
    const nowIso = new Date().toISOString();

    let metaPayload: Record<string, any>;
    let messageContent: Record<string, any>;
    let dispatchMode: "free_form" | "template" = "free_form";
    let templateNameUsed: string | undefined = undefined;

    if (serviceWindowOpen) {
      // 24h Window is OPEN: Send Direct Free-Form Text
      metaPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { preview_url: false, body: text },
      };
      messageContent = {
        version: "1",
        type: "text",
        kind: "text",
        text,
      };
    } else {
      // 24h Window is CLOSED: Select an approved Utility template to reach the patient
      dispatchMode = "template";
      const { data: templates } = await admin
        .from("channel_message_templates")
        .select("id,event_type,provider_template_name,language_code,variable_map")
        .eq("organization_id", organization.id)
        .eq("channel", "whatsapp")
        .eq("status", "approved");

      // Prefer care_campaign, follow_up, or confirmation template
      const template = (templates ?? []).find((t) => ["care_campaign", "follow_up", "appointment_reminder"].includes(t.event_type))
        || templates?.[0];

      if (!template) {
        return NextResponse.json({
          error: "The 24-hour WhatsApp service window is closed and no approved Meta template was found. Please activate templates in Integrations.",
          serviceWindowOpen: false,
        }, { status: 409 });
      }

      templateNameUsed = template.provider_template_name;
      const langCode = template.language_code || "en";

      metaPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "template",
        template: {
          name: template.provider_template_name,
          language: { code: langCode },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: name },
                { type: "text", text: organization.name || "Clinic" },
                { type: "text", text: text.slice(0, 500) },
              ],
            },
          ],
        },
      };

      messageContent = {
        version: "1",
        type: "data",
        kind: "template",
        text: `[Template: ${template.provider_template_name}] ${text}`,
        data: metaPayload.template,
      };
    }

    // 4. Dispatch to Meta WhatsApp Cloud API
    const metaRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaResult = await metaRes.json().catch(() => ({})) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string; code?: number };
    };

    if (!metaRes.ok || !metaResult.messages?.[0]?.id) {
      const errMsg = metaResult.error?.message || "WhatsApp message dispatch was rejected by Meta.";
      return NextResponse.json({ error: errMsg, serviceWindowOpen }, { status: 400 });
    }

    const metaMessageId = metaResult.messages[0].id;

    // 5. Insert outgoing message to database
    const { data: insertedMsg } = await admin
      .from("messages")
      .insert({
        organization_id: organization.id,
        conversation_id: conversation.id,
        service: "whatsapp",
        organization_address: phoneId,
        contact_address: cleanPhone,
        direction: "outgoing",
        external_id: metaMessageId,
        content: messageContent,
        status: {
          accepted: true,
          sent: nowIso,
          provider_response: metaResult,
        },
      })
      .select("id,conversation_id,external_id,direction,content,status,timestamp")
      .single();

    // Pause AI for manual staff interaction
    await admin
      .from("conversations")
      .update({ ai_paused: true, updated_at: nowIso })
      .eq("id", conversation.id);

    return NextResponse.json({
      success: true,
      mode: dispatchMode,
      templateUsed: templateNameUsed,
      serviceWindowOpen,
      messageId: insertedMsg?.id || metaMessageId,
      conversationId: conversation.id,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
