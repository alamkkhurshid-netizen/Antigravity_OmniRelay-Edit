import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import crypto from "crypto";

// Helper to hash user data for Meta CAPI
const hashData = (data: string) =>
  crypto.createHash("sha256").update(data.trim().toLowerCase()).digest("hex");

export async function POST(req: Request) {
  try {
    // 1. Strict Authentication & Workspace Resolution
    const { supabase, organization, user } = await getWorkspace();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!organization?.id) {
      return NextResponse.json({ error: "Active workspace organization required" }, { status: 403 });
    }

    // 2. Derive organization strictly from authenticated workspace context (Anti-Spoofing)
    const organizationId = organization.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const event_name = body.event_name ? String(body.event_name) : null;
    const event_time = typeof body.event_time === "number" ? body.event_time : null;
    const user_data = (body.user_data || {}) as Record<string, unknown>;
    const custom_data = (body.custom_data || {}) as Record<string, unknown>;
    const event_source_url = body.event_source_url ? String(body.event_source_url) : "";

    if (!event_name) {
      return NextResponse.json({ error: "Missing required parameter: event_name" }, { status: 400 });
    }

    // 3. Fetch Meta CAPI Config for the verified workspace organization (Scoped by RLS)
    const { data: capiConfig, error: configError } = await supabase
      .from("meta_capi_config")
      .select("pixel_id, access_token, test_event_code")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (configError || !capiConfig || !capiConfig.pixel_id || !capiConfig.access_token) {
      return NextResponse.json(
        { error: "Meta CAPI not configured or inactive for this organization" },
        { status: 404 }
      );
    }

    // 4. Prepare payload for Meta Graph API
    const eventId = crypto.randomUUID();
    const currentUnixTime = Math.floor(Date.now() / 1000);

    const hashedUserData: Record<string, unknown> = {
      client_user_agent: req.headers.get("user-agent") || "",
      client_ip_address: req.headers.get("x-forwarded-for") || req.headers.get("remote-addr") || "",
    };

    if (user_data.em) hashedUserData.em = hashData(String(user_data.em));
    if (user_data.ph) hashedUserData.ph = hashData(String(user_data.ph));
    if (user_data.fbc) hashedUserData.fbc = String(user_data.fbc);
    if (user_data.fbp) hashedUserData.fbp = String(user_data.fbp);

    const capiPayload = {
      data: [
        {
          event_name,
          event_time: event_time || currentUnixTime,
          event_id: eventId,
          event_source_url,
          action_source: "website",
          user_data: hashedUserData,
          custom_data,
        },
      ],
      ...(capiConfig.test_event_code && { test_event_code: capiConfig.test_event_code }),
    };

    // 5. Send to Meta Graph API
    const metaApiUrl = `https://graph.facebook.com/v18.0/${encodeURIComponent(
      capiConfig.pixel_id
    )}/events?access_token=${encodeURIComponent(capiConfig.access_token)}`;

    const metaResponse = await fetch(metaApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(capiPayload),
    });

    const metaResult = await metaResponse.json().catch(() => ({}));

    if (!metaResponse.ok) {
      console.error("[Meta CAPI Error]", metaResult);
      return NextResponse.json({ error: "Failed to dispatch CAPI event to Meta" }, { status: 502 });
    }

    return NextResponse.json({ success: true, event_id: eventId });
  } catch (err) {
    console.error("[CAPI Endpoint Error]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
