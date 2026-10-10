import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const VOICE_ENGINE_URL = process.env.VOICE_ENGINE_URL || "https://130.210.29.75.sslip.io";
const VOICE_ENGINE_API_KEY = process.env.OMNIRELAY_VOICE_API_KEY || process.env.OMNIRELAY_API_KEY;

export async function POST(request: Request) {
  try {
    if (!VOICE_ENGINE_API_KEY) {
      console.error("[VOICE_TEST_CALL] Missing OMNIRELAY_VOICE_API_KEY configuration.");
      return NextResponse.json(
        { error: "Voice Engine API key is not configured on the server." },
        { status: 500 }
      );
    }

    const { supabase, organization } = await getWorkspace();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (!organization) {
      return NextResponse.json({ error: "Workspace organization not found." }, { status: 404 });
    }

    const body = await request.json();
    const phone = body.phone?.trim();

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }

    // Call Voice Engine /dial endpoint
    const voicePayload = {
      to_phone: phone,
      patient_name: body.tester_name || user.email?.split("@")[0] || "Doctor",
      doctor_name: body.bot_name || "Maya AI",
      appointment_time: "Now (Interactive Test)",
      campaign_type: body.campaign_type || (body.agent_role === "sales" ? "sales_package" : "demo_test"),
      caller_id: body.caller_id || "08047283676",
    };

    try {
      const response = await fetch(`${VOICE_ENGINE_URL}/dial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": VOICE_ENGINE_API_KEY,
        },
        body: JSON.stringify(voicePayload),
      });

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          { error: data.detail?.reason || data.detail?.message || "Failed to initiate test call." },
          { status: response.status }
        );
      }

      return NextResponse.json({
        success: true,
        call_sid: data.call_sid,
        message: `Test call initiated successfully to ${phone}! Your phone will ring in a few seconds.`,
      });
    } catch (networkErr: any) {
      console.error("[VOICE_TEST_CALL] Network error calling Voice Engine:", networkErr);
      return NextResponse.json(
        { error: "Could not connect to Voice AI cluster. Please check server status." },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error("[VOICE_TEST_CALL] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
