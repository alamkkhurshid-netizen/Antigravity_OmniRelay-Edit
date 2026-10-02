import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import crypto from "crypto";

// Helper to hash user data for Meta CAPI
const hashData = (data: string) => crypto.createHash("sha256").update(data.trim().toLowerCase()).digest("hex");

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // We expect the client to send the organization_id, event details, and user data
    const body = await req.json();
    const { organization_id, event_name, event_time, user_data, custom_data, event_source_url } = body;

    if (!organization_id || !event_name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch Meta CAPI Config for the organization
    const { data: capiConfig, error: configError } = await supabase
      .from("meta_capi_config")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .single();

    if (configError || !capiConfig) {
      return NextResponse.json({ error: "Meta CAPI not configured or inactive for this organization" }, { status: 404 });
    }

    // 2. Prepare payload for Meta Graph API
    const eventId = crypto.randomUUID();
    const currentUnixTime = Math.floor(Date.now() / 1000);

    // Hash user data fields as required by Meta (email, phone)
    const hashedUserData: any = {
      client_user_agent: req.headers.get("user-agent") || "",
      client_ip_address: req.headers.get("x-forwarded-for") || req.headers.get("remote-addr") || "",
    };

    if (user_data?.em) hashedUserData.em = hashData(user_data.em);
    if (user_data?.ph) hashedUserData.ph = hashData(user_data.ph);
    if (user_data?.fbc) hashedUserData.fbc = user_data.fbc;
    if (user_data?.fbp) hashedUserData.fbp = user_data.fbp;

    const capiPayload = {
      data: [
        {
          event_name: event_name,
          event_time: event_time || currentUnixTime,
          event_id: eventId,
          event_source_url: event_source_url || "",
          action_source: "website",
          user_data: hashedUserData,
          custom_data: custom_data || {},
        },
      ],
      ...(capiConfig.test_event_code && { test_event_code: capiConfig.test_event_code }),
    };

    // 3. Send to Meta Graph API
    const metaApiUrl = `https://graph.facebook.com/v18.0/${capiConfig.pixel_id}/events?access_token=${capiConfig.access_token}`;
    
    const metaResponse = await fetch(metaApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiPayload),
    });

    const metaResponseData = await metaResponse.json();

    // 4. Log the event in Supabase
    await supabase.from("capi_event_logs").insert({
      organization_id,
      event_name,
      event_id: eventId,
      payload: capiPayload,
      status: metaResponse.ok ? "success" : "failed",
      api_response: metaResponseData,
    });

    if (!metaResponse.ok) {
      console.error("Meta CAPI Error:", metaResponseData);
      return NextResponse.json({ error: "Failed to send event to Meta", details: metaResponseData }, { status: 400 });
    }

    return NextResponse.json({ success: true, event_id: eventId, meta_response: metaResponseData });
  } catch (error: any) {
    console.error("CAPI Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
