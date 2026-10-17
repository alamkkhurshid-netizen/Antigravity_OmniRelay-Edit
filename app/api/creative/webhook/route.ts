import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook receiver for Topview and Higgsfield video rendering callbacks
export async function POST(req: Request) {
  const url = new URL(req.url);
  const recordId = url.searchParams.get("record_id");

  if (!recordId) {
    return NextResponse.json({ error: "Missing record_id parameter" }, { status: 400 });
  }

  // 1. Authenticate callback authenticity (strictly fail-closed)
  const secret = process.env.CREATIVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Creative Webhook] CREATIVE_WEBHOOK_SECRET is not configured. Rejecting callback.");
    return NextResponse.json({ error: "Webhook authentication unconfigured" }, { status: 500 });
  }

  const authHeader = req.headers.get("x-creative-secret") || req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    console.warn("[Creative Webhook] Missing authentication token for record:", recordId);
    return NextResponse.json({ error: "Unauthorized: Missing authentication" }, { status: 401 });
  }

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
    console.warn("[Creative Webhook] Unauthorized callback attempt for record:", recordId);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const adminClient = createAdminClient();

    // 2. Verify record ownership and expected state transitions
    const { data: record, error: fetchError } = await adminClient
      .from("retail_creatives")
      .select("id, status, organization_id")
      .eq("id", recordId)
      .maybeSingle();

    if (fetchError || !record) {
      console.error("[Creative Webhook] Record not found:", recordId);
      return NextResponse.json({ error: "Creative record not found" }, { status: 404 });
    }

    // Both Topview and Higgsfield send back a video_url on completion
    const videoUrl = body.video_url || body.output_url || body.result?.url;
    const incomingStatus = body.status || "completed";

    let finalStatus = "failed";
    if ((incomingStatus === "completed" || incomingStatus === "success") && videoUrl) {
      finalStatus = "completed";
    }

    // 3. Persist update and check database errors before acknowledging receipt
    const { error: updateError } = await adminClient
      .from("retail_creatives")
      .update({
        video_url: finalStatus === "completed" ? videoUrl : null,
        status: finalStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    if (updateError) {
      console.error("[Creative Webhook] Failed to persist creative update:", updateError);
      return NextResponse.json({ error: "Database update failure" }, { status: 500 });
    }

    console.log(`[Creative Webhook] Successfully updated record ${recordId} to status: ${finalStatus}`);
    return NextResponse.json({ received: true, status: finalStatus });
  } catch (error: any) {
    console.error("[Creative Webhook] Exception during webhook processing:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
