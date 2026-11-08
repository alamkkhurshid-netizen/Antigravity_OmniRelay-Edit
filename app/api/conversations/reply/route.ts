import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });

  const payload = await request.json().catch(() => ({})) as { conversationId?: string; text?: string };
  const text = payload.text?.trim();
  if (!payload.conversationId || !text) return NextResponse.json({ error: "Conversation and message are required." }, { status: 400 });
  if (text.length > 4096) return NextResponse.json({ error: "WhatsApp replies cannot exceed 4,096 characters." }, { status: 400 });

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id,organization_id,service,organization_address,contact_address,group_address,status")
    .eq("id", payload.conversationId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!conversation || conversation.status !== "active") return NextResponse.json({ error: "Active conversation not found." }, { status: 404 });
  if (conversation.service !== "whatsapp" || !conversation.contact_address) return NextResponse.json({ error: "This conversation cannot receive a WhatsApp reply." }, { status: 400 });

  const { data: latestIncoming, error: incomingError } = await supabase
    .from("messages")
    .select("timestamp")
    .eq("organization_id", organization.id)
    .eq("conversation_id", conversation.id)
    .eq("direction", "incoming")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (incomingError) return NextResponse.json({ error: "The WhatsApp reply window could not be verified." }, { status: 503 });
  const incomingAt = latestIncoming?.timestamp ? new Date(latestIncoming.timestamp).getTime() : Number.NaN;
  const serviceWindowOpen = Number.isFinite(incomingAt) && Date.now() - incomingAt < 24 * 60 * 60 * 1000;
  if (!serviceWindowOpen) {
    return NextResponse.json({
      code: "WHATSAPP_SERVICE_WINDOW_CLOSED",
      error: "The 24-hour WhatsApp reply window is closed. Send an approved template to continue.",
    }, { status: 409 });
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .eq("ai", false)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      organization_id: organization.id,
      conversation_id: conversation.id,
      service: "whatsapp",
      organization_address: conversation.organization_address,
      contact_address: conversation.contact_address,
      group_address: conversation.group_address,
      direction: "outgoing",
      agent_id: agent?.id ?? null,
      content: { version: "1", type: "text", kind: "text", text },
      status: { pending: nowIso },
    })
    .select("id,conversation_id,external_id,direction,content,status,timestamp,agent_id")
    .single();
  if (error || !message) return NextResponse.json({ error: error?.message ?? "Message could not be queued." }, { status: 400 });

  // Resolve Meta Phone Number ID and Access Token
  const adminClient = createAdminClient();
  let phoneId = conversation.organization_address;

  const { data: connection } = await adminClient
    .from("channel_connections")
    .select("external_phone_number_id,status,display_address")
    .eq("organization_id", organization.id)
    .eq("channel", "whatsapp")
    .maybeSingle();

  if (connection?.external_phone_number_id) {
    if (!phoneId || phoneId === connection.display_address) {
      phoneId = connection.external_phone_number_id;
    }
  }

  let accessToken: string | null = null;
  if (phoneId) {
    try {
      const { data: vaultToken } = await adminClient.rpc("get_whatsapp_access_token", {
        p_organization_id: organization.id,
        p_phone_number_id: phoneId,
      });
      if (typeof vaultToken === "string" && vaultToken.length > 0) {
        accessToken = vaultToken;
      }
    } catch {
      // Fall through to fallback credential lookup
    }
  }

  if (!accessToken) {
    const { data: addrRow } = await adminClient
      .from("organizations_addresses")
      .select("extra,address")
      .eq("organization_id", organization.id)
      .eq("service", "whatsapp")
      .or(`address.eq.${phoneId},status.eq.connected`)
      .maybeSingle();

    const extra = addrRow?.extra as { access_token?: string } | null;
    accessToken = extra?.access_token || process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.WHATSAPP_SYSTEM_TOKEN || null;
    if (!phoneId && addrRow?.address) {
      phoneId = addrRow.address;
    }
  }

  if (!accessToken || !phoneId) {
    const failedStatus = {
      failed: true,
      failed_at: new Date().toISOString(),
      errors: [{ message: "WhatsApp credentials not configured for outbound messaging." }],
    };
    await adminClient.from("messages").update({ status: failedStatus }).eq("id", message.id);
    return NextResponse.json(
      {
        error: "WhatsApp connection credentials missing or access token unavailable.",
        message: { ...message, status: failedStatus },
      },
      { status: 502 }
    );
  }

  // Dispatch message to Meta WhatsApp Cloud API
  const graphVersion = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";
  const recipientPhone = conversation.contact_address.replace(/\D/g, "");

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientPhone,
          type: "text",
          text: {
            preview_url: false,
            body: text,
          },
        }),
      }
    );

    const metaResult = await metaRes.json().catch(() => ({})) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string; code?: number; type?: string; fbtrace_id?: string };
    };

    if (!metaRes.ok || !metaResult.messages?.[0]?.id) {
      const metaError = metaResult.error?.message || "WhatsApp provider rejected this message.";
      const failedStatus = {
        failed: true,
        failed_at: new Date().toISOString(),
        errors: [metaResult.error || { message: metaError }],
        provider_response: metaResult,
      };

      await adminClient.from("messages").update({ status: failedStatus }).eq("id", message.id);

      return NextResponse.json(
        {
          error: metaError,
          code: metaResult.error?.code ? String(metaResult.error.code) : "DISPATCH_FAILED",
          message: { ...message, status: failedStatus },
        },
        { status: 400 }
      );
    }

    const metaMessageId = metaResult.messages[0].id;
    const acceptedStatus = {
      accepted: true,
      sent: new Date().toISOString(),
      provider_response: metaResult,
    };

    const { data: updatedMessage } = await adminClient
      .from("messages")
      .update({
        external_id: metaMessageId,
        status: acceptedStatus,
      })
      .eq("id", message.id)
      .select("id,conversation_id,external_id,direction,content,status,timestamp,agent_id")
      .single();

    // CTO Stage 8: Transition connection to live upon verified outbound delivery acceptance
    await adminClient
      .from("channel_connections")
      .update({
        status: "live",
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization.id)
      .eq("channel", "whatsapp")
      .in("status", ["connected", "acceptance_testing", "test"]);

    // Deduct usage if active billing is enabled
    try {
      const { recordAndDeduct } = await import("@/lib/billing/deduction-engine");
      await recordAndDeduct(organization.id, metaMessageId, "service");
    } catch {
      // Non-fatal for messaging flow
    }

    return NextResponse.json({
      message: updatedMessage ?? { ...message, status: acceptedStatus, external_id: metaMessageId },
    });
  } catch (networkError: any) {
    const failedStatus = {
      failed: true,
      failed_at: new Date().toISOString(),
      errors: [{ message: networkError?.message || "Network error contacting Meta Cloud API." }],
    };
    await adminClient.from("messages").update({ status: failedStatus }).eq("id", message.id);

    return NextResponse.json(
      {
        error: networkError?.message || "Failed to reach WhatsApp Cloud API.",
        message: { ...message, status: failedStatus },
      },
      { status: 502 }
    );
  }
}

