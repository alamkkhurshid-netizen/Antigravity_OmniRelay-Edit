import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getWorkspace } from "@/lib/workspace";
import { supabaseUrl } from "@/lib/supabase/config";
import { consumeRateLimit } from "@/lib/operations";

type Payload = {
  phone?: string;
  name?: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  consentSource?: string;
  consentConfirmed?: boolean;
};

const CONSENT_SOURCES = new Set(["customer_request", "booking_form", "written", "existing_relationship"]);

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Workspace not found." }, { status: 409 });
  if (!await consumeRateLimit(supabase, "conversation_start", 20, 3600)) {
    return NextResponse.json({ error: "Conversation start limit reached. Please try again later." }, { status: 429 });
  }

  const payload = await request.json().catch(() => ({})) as Payload;
  const phone = String(payload.phone ?? "").replace(/\D/g, "");
  const name = String(payload.name ?? "").trim();
  const consentSource = String(payload.consentSource ?? "");
  if (phone.length < 10 || phone.length > 15) {
    return NextResponse.json({ error: "Enter a mobile number with country code, using 10–15 digits." }, { status: 400 });
  }
  if (!payload.consentConfirmed || !CONSENT_SOURCES.has(consentSource)) {
    return NextResponse.json({ error: "Confirmed WhatsApp consent and its source are required." }, { status: 400 });
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Server connection is incomplete." }, { status: 503 });
  const admin = createAdminClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: connection } = await supabase
    .from("channel_connections")
    .select("status,external_phone_number_id")
    .eq("organization_id", organization.id)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!connection || !["test", "live"].includes(connection.status) || !connection.external_phone_number_id) {
    return NextResponse.json({ error: "Connect an active WhatsApp number first." }, { status: 409 });
  }

  const isTestTemplate = payload.templateId === "hello_world" && connection.status === "test";
  const { data: approvedTemplate } = isTestTemplate ? { data: null } : await supabase
    .from("channel_message_templates")
    .select("id,event_type,provider_template_name,language_code,variable_map")
    .eq("id", payload.templateId ?? "")
    .eq("organization_id", organization.id)
    .eq("channel", "whatsapp")
    .eq("status", "approved")
    .maybeSingle();
  if (!isTestTemplate && !approvedTemplate) return NextResponse.json({ error: "Select an approved WhatsApp template." }, { status: 400 });
  const templateName = isTestTemplate ? "hello_world" : approvedTemplate!.provider_template_name;
  const languageCode = isTestTemplate ? "en_US" : approvedTemplate!.language_code;
  const variableMap = approvedTemplate?.variable_map && typeof approvedTemplate.variable_map === "object" ? approvedTemplate.variable_map as Record<string, string> : {};
  const variablePositions = Object.keys(variableMap).sort((left, right) => Number(left) - Number(right));
  const variables = payload.templateVariables ?? {};
  const missingVariable = variablePositions.find((position) => !String(variables[position] ?? "").trim());
  if (missingVariable) return NextResponse.json({ error: `Complete the ${variableMap[missingVariable].replaceAll("_", " ")} template value.` }, { status: 400 });
  if (variablePositions.some((position) => String(variables[position]).length > 1024)) return NextResponse.json({ error: "Template values cannot exceed 1,024 characters." }, { status: 400 });

  const capturedAt = new Date().toISOString();
  const optIn = { status: "granted", source: consentSource, captured_at: capturedAt, captured_by: user.id };
  const { data: existingAddress } = await admin
    .from("contacts_addresses")
    .select("address,contact_id,extra,status")
    .eq("organization_id", organization.id)
    .eq("service", "whatsapp")
    .eq("address", phone)
    .maybeSingle();

  let contactId = existingAddress?.contact_id ?? null;
  let contact = null;
  if (contactId) {
    const { data: existingContact } = await admin
      .from("contacts")
      .select("id,name,status,extra")
      .eq("organization_id", organization.id)
      .eq("id", contactId)
      .maybeSingle();
    const currentExtra = existingContact?.extra && typeof existingContact.extra === "object" && !Array.isArray(existingContact.extra)
      ? existingContact.extra
      : {};
    const { data, error } = await admin
      .from("contacts")
      .update({ name: name || existingContact?.name || phone, status: "active", extra: { ...currentExtra, whatsapp_opt_in: optIn } })
      .eq("organization_id", organization.id)
      .eq("id", contactId)
      .select("id,name,status,extra")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    contact = data;
  } else {
    const { data, error } = await admin
      .from("contacts")
      .insert({ organization_id: organization.id, name: name || phone, status: "active", extra: { whatsapp_opt_in: optIn } })
      .select("id,name,status,extra")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Contact could not be created." }, { status: 400 });
    contact = data;
    contactId = data.id;
  }

  const addressExtra = existingAddress?.extra && typeof existingAddress.extra === "object" && !Array.isArray(existingAddress.extra)
    ? existingAddress.extra
    : {};
  const addressMutation = existingAddress
    ? admin.from("contacts_addresses").update({ contact_id: contactId, status: "active", extra: { ...addressExtra, phone_number: phone, whatsapp_opt_in: optIn } })
      .eq("organization_id", organization.id).eq("service", "whatsapp").eq("address", phone)
    : admin.from("contacts_addresses").insert({
      organization_id: organization.id, service: "whatsapp", address: phone, contact_id: contactId,
      status: "active", extra: { source: "outbound", phone_number: phone, whatsapp_opt_in: optIn },
    });
  const { data: address, error: addressError } = await addressMutation
    .select("address,contact_id,extra,status")
    .single();
  if (addressError || !address) return NextResponse.json({ error: addressError?.message ?? "WhatsApp address could not be saved." }, { status: 400 });

  const { data: existingConversation } = await admin
    .from("conversations")
    .select("id,service,organization_address,contact_address,name,status,ai_paused,paused_at,assigned_agent_id,extra,created_at,updated_at")
    .eq("organization_id", organization.id)
    .eq("service", "whatsapp")
    .eq("organization_address", connection.external_phone_number_id)
    .eq("contact_address", phone)
    .eq("status", "active")
    .maybeSingle();

  let conversation = existingConversation;
  if (!conversation) {
    const result = await admin
      .from("conversations")
      .insert({
        organization_id: organization.id,
        service: "whatsapp",
        organization_address: connection.external_phone_number_id,
        contact_address: phone,
        name: name || phone,
        status: "active",
        ai_paused: true,
        paused_at: capturedAt,
        extra: { source: "manual_outbound" },
      })
      .select("id,service,organization_address,contact_address,name,status,ai_paused,paused_at,assigned_agent_id,extra,created_at,updated_at")
      .single();
    if (result.error || !result.data) return NextResponse.json({ error: result.error?.message ?? "Conversation could not be created." }, { status: 400 });
    conversation = result.data;
  }

  const { data: agent } = await admin
    .from("agents")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .eq("ai", false)
    .maybeSingle();
  const { data: message, error: messageError } = await admin
    .from("messages")
    .insert({
      organization_id: organization.id,
      conversation_id: conversation.id,
      service: "whatsapp",
      organization_address: connection.external_phone_number_id,
      contact_address: phone,
      direction: "outgoing",
      agent_id: agent?.id ?? null,
      content: {
        version: "1",
        type: "template",
        kind: "template",
        text: isTestTemplate ? "Meta test message" : `${approvedTemplate!.event_type.replaceAll("_", " ")} template`,
        data: {
          name: templateName,
          language: { code: languageCode || "en" },
          ...(variablePositions.length ? { components: [{ type: "body", parameters: variablePositions.map((position) => ({ type: "text", text: String(variables[position]).trim() })) }] } : {}),
        },
      },
    })
    .select("id,conversation_id,external_id,direction,content,status,timestamp,agent_id")
    .single();
  if (messageError || !message) return NextResponse.json({ error: messageError?.message ?? "Message could not be queued." }, { status: 400 });

  return NextResponse.json({ conversation, message, contact, address });
}
