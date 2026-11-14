import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    // 1. Zero-Trust Webhook Authentication
    // Ensure this request actually came from our secure Supabase database trigger
    const webhookSecret = req.headers.get("x-webhook-secret");
    const configuredSecret = process.env.SUPABASE_WEBHOOK_SECRET;

    // Fail closed if server has no configured secret or if it is set to the insecure published default
    if (!configuredSecret || configuredSecret === "123456" || configuredSecret.length < 16) {
      console.error("[Super CTO] Insecure or missing SUPABASE_WEBHOOK_SECRET configuration.");
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    if (!webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Constant-time comparison to prevent timing attacks
    const incomingBuf = Buffer.from(webhookSecret);
    const expectedBuf = Buffer.from(configuredSecret);
    if (incomingBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(incomingBuf, expectedBuf)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse the Supabase Webhook Payload
    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // We only care about new inserts into the governance queue
    if (payload.type !== "INSERT" || payload.table !== "ai_governance_queue" || !payload.record) {
      return NextResponse.json({ message: "Ignored: Not an insert event" });
    }

    const { id, rationale, source_error } = payload.record;

    // Sanitize string interpolations to prevent phishing/formatting manipulation
    const cleanId = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const rawErrorMessage = typeof source_error === "object" ? source_error?.message : String(source_error || "Unknown error");
    const cleanErrorMessage = String(rawErrorMessage || "Unknown error").slice(0, 300).replace(/[*_~`]/g, "");
    const cleanRationale = String(rationale || "Automated diagnosis staged for review.").slice(0, 300).replace(/[*_~`]/g, "");

    // 3. Format the WhatsApp Message
    const messageText = `🚨 *Super CTO Alert* 🚨\n\n*Error:* ${cleanErrorMessage}\n\n*Diagnosis:* ${cleanRationale}\n\n*Ticket ID:* ${cleanId || "N/A"}`;

    // 4. Send the WhatsApp Message via Meta Graph API
    const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
    const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN;
    const founderNumber = process.env.FOUNDER_WHATSAPP_NUMBER;

    if (!phoneNumberId || !systemToken || !founderNumber) {
      console.error("Missing WhatsApp Environment Variables for Super CTO Alert");
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    const graphResponse = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${systemToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: founderNumber,
        type: "text",
        text: {
          preview_url: false,
          body: messageText
        }
      })
    });

    const graphResult = await graphResponse.json().catch(() => ({}));

    if (!graphResponse.ok) {
      console.error("WhatsApp Dispatch Failed:", graphResult);
      return NextResponse.json({ error: "WhatsApp Dispatch Failed", details: graphResult }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: "WhatsApp Alert Sent!" });
  } catch (error: any) {
    console.error("Notify Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
