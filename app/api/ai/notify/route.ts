import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. Zero-Trust Webhook Authentication
    // Ensure this request actually came from our secure Supabase database trigger
    const webhookSecret = req.headers.get("x-webhook-secret");
    if (webhookSecret !== process.env.SUPABASE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse the Supabase Webhook Payload
    const payload = await req.json();
    
    // We only care about new inserts into the governance queue
    if (payload.type !== "INSERT" || payload.table !== "ai_governance_queue") {
      return NextResponse.json({ message: "Ignored: Not an insert event" });
    }

    const { id, rationale, source_error } = payload.record;
    
    // Fallback if the source_error is structured differently
    const errorMessage = source_error?.message || "Unknown error";

    // 3. Format the WhatsApp Message
    const messageText = `🚨 *Super CTO Alert* 🚨\n\n*Error:* ${errorMessage}\n\n*AI Rationale:* ${rationale}\n\nReply *APPROVE ${id}* to instantly deploy this patch.`;

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

    const graphResult = await graphResponse.json();

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
