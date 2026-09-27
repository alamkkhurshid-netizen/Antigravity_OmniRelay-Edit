import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    // 1. Verify Vercel Cron Security Header
    // Vercel automatically passes this header for cron requests to prevent unauthorized triggers.
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
    const founderNumber = process.env.FOUNDER_WHATSAPP_NUMBER;

    if (!systemToken || !phoneNumberId || !founderNumber) {
      console.warn("[Back-Office Admin] Missing environment variables for token health check.");
      return NextResponse.json({ error: "Missing config" }, { status: 500 });
    }

    console.log("[Back-Office Admin] Commencing daily Meta API token health check...");

    // 2. Ping Meta Graph API to verify token health
    // We attempt to fetch the business profile as a lightweight test
    const graphResponse = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/whatsapp_business_profile?fields=about,messaging_product`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${systemToken}`
      }
    });

    const result = await graphResponse.json();

    if (!graphResponse.ok) {
      console.error("[Back-Office Admin] CRITICAL: Meta Token is INVALID or EXPIRING", result);
      
      // 3. Alert the Founder via WhatsApp (if the token is completely dead, this text might fail, 
      // but if it's just missing permissions or rate-limited, the text might still go through.
      // In a production system with multiple tenants, we'd loop through all tenant tokens, 
      // and use the healthy system token to alert the founder about failing tenant tokens!)
      
      // For this MVP, we simulate sending a warning
      const messageText = `⚠️ *Back-Office Admin Alert* ⚠️\n\nA critical issue was detected with the OmniRelay Meta API Token. \nError: ${result.error?.message || "Unknown error"}\n\nPlease refresh the token in Meta Business Settings immediately.`;
      
      await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${systemToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: founderNumber,
          type: "text",
          text: { body: messageText }
        })
      });

      return NextResponse.json({ status: "failed", error: result.error });
    }

    console.log("[Back-Office Admin] Token health check passed. Systems nominal.");
    return NextResponse.json({ status: "healthy", message: "All monitored tokens are valid." });

  } catch (error: any) {
    console.error("[Back-Office Admin] Internal Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
