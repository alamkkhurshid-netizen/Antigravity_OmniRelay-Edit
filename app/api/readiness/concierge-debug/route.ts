import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TARGET_ORG = "24559e31-d664-4387-bc2d-998d8889c2d4";

export async function GET(request: Request) {
  try {
    const admin = createAdminClient();

    // 1. Booking settings
    const { data: settings, error: setErr } = await admin
      .from("whatsapp_booking_settings")
      .select("*")
      .eq("organization_id", TARGET_ORG)
      .maybeSingle();

    // 2. Channel connections
    const { data: connection, error: connErr } = await admin
      .from("channel_connections")
      .select("*")
      .eq("organization_id", TARGET_ORG)
      .eq("channel", "whatsapp")
      .maybeSingle();

    // 3. Organizations addresses
    const { data: addresses, error: addrErr } = await admin
      .from("organizations_addresses")
      .select("address,service,status,extra,created_at")
      .eq("organization_id", TARGET_ORG)
      .eq("service", "whatsapp");

    // 4. Concierge dispatches
    const { data: dispatches, error: dispErr } = await admin
      .from("whatsapp_concierge_dispatches")
      .select("*")
      .eq("organization_id", TARGET_ORG)
      .order("created_at", { ascending: false })
      .limit(10);

    // 5. Booking sessions
    const { data: sessions, error: sessErr } = await admin
      .from("whatsapp_booking_sessions")
      .select("*")
      .eq("organization_id", TARGET_ORG)
      .order("updated_at", { ascending: false })
      .limit(5);

    // 6. Recent messages (both incoming & outgoing)
    const { data: recentMessages, error: msgErr } = await admin
      .from("messages")
      .select("id,conversation_id,organization_address,contact_address,direction,service,content,status,timestamp")
      .eq("organization_id", TARGET_ORG)
      .eq("service", "whatsapp")
      .order("timestamp", { ascending: false })
      .limit(10);

    // 7. Check vault secrets presence and get_whatsapp_access_token
    let tokenLength = 0;
    let tokenError: string | null = null;
    try {
      const { data: tokenData, error: tErr } = await admin.rpc("get_whatsapp_access_token", {
        p_organization_id: TARGET_ORG,
        p_phone_number_id: "1486286344562658",
      });
      if (tokenData && typeof tokenData === "string") {
        tokenLength = tokenData.length;
      }
      if (tErr) tokenError = tErr.message;
    } catch (e: any) {
      tokenError = e.message;
    }

    return NextResponse.json({
      target_org: TARGET_ORG,
      tokenLength,
      tokenError,
      settings: settings ?? null,
      settingsError: setErr?.message ?? null,
      connection: connection ?? null,
      connectionError: connErr?.message ?? null,
      addresses: addresses ?? [],
      addressesError: addrErr?.message ?? null,
      dispatches: dispatches ?? [],
      dispatchesError: dispErr?.message ?? null,
      sessions: sessions ?? [],
      sessionsError: sessErr?.message ?? null,
      messages: recentMessages ?? [],
      messagesError: msgErr?.message ?? null,
      vaultSecrets,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST endpoint to manually trigger concierge processing on the latest incoming message
export async function POST(request: Request) {
  try {
    const admin = createAdminClient();
    const { data: latestIncoming } = await admin
      .from("messages")
      .select("id,organization_id,conversation_id,contact_address,content")
      .eq("organization_id", TARGET_ORG)
      .eq("service", "whatsapp")
      .eq("direction", "incoming")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestIncoming) {
      return NextResponse.json({ error: "No incoming messages found for this clinic." }, { status: 404 });
    }

    // Call supabase edge function directly from the server
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://dwkwxrcuycsqiviozgtl.supabase.co";
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    const conciergeUrl = `${supabaseUrl}/functions/v1/whatsapp-booking-concierge`;
    const edgeRes = await fetch(conciergeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ message_id: latestIncoming.id }),
    });

    const edgeData = await edgeRes.json().catch(() => ({}));

    return NextResponse.json({
      conciergeUrl,
      edgeHttpStatus: edgeRes.status,
      edgeResponse: edgeData,
      triggeredMessage: latestIncoming,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
