import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Webhook receiver for Topview and Higgsfield video rendering callbacks
export async function POST(req: Request) {
  const url = new URL(req.url);
  const recordId = url.searchParams.get("record_id");

  if (!recordId) {
    return NextResponse.json({ error: "Missing record_id" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const supabase = await createClient();

    // Both Topview and Higgsfield send back a video_url on completion
    const videoUrl = body.video_url || body.output_url || body.result?.url;
    const status = body.status || "completed";

    if (status === "completed" && videoUrl) {
      await supabase
        .from("retail_creatives")
        .update({ video_url: videoUrl, status: "completed" })
        .eq("id", recordId);
    } else if (status === "failed") {
      await supabase
        .from("retail_creatives")
        .update({ status: "failed" })
        .eq("id", recordId);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[Creative Webhook] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
