import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";



export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateStr = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  if (error) {
    console.warn("[Google Calendar OAuth] Received error from Google:", error);
    return NextResponse.redirect(`${baseUrl}/app/settings?error=calendar_auth_failed`);
  }

  if (!code || !stateStr) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 500 });
  }

  // 1. Verify signed HMAC state and expiration
  const [payloadB64, signature] = stateStr.split(".");
  if (!payloadB64 || !signature) {
    console.error("[Google Calendar OAuth] Malformed state string (missing signature).");
    return NextResponse.redirect(`${baseUrl}/app/settings?error=invalid_state`);
  }

  const expectedSig = crypto.createHmac("sha256", clientSecret).update(payloadB64).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.error("[Google Calendar OAuth] State signature mismatch.");
    return NextResponse.redirect(`${baseUrl}/app/settings?error=tampered_state`);
  }

  let state: { organizationId: string; resourceId?: string | null; userId: string; nonce: string; exp: number };
  try {
    state = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return NextResponse.redirect(`${baseUrl}/app/settings?error=corrupt_state`);
  }

  const now = Date.now();
  if (!state.exp || now > state.exp) {
    console.error("[Google Calendar OAuth] State token expired.");
    return NextResponse.redirect(`${baseUrl}/app/settings?error=state_expired`);
  }

  // 2. Atomic database nonce consumption (strictly fail-closed via RPC)
  const adminClient = createAdminClient();
  const { data: consumedSuccessfully, error: nonceRpcError } = await adminClient.rpc("consume_oauth_nonce", {
    p_nonce: state.nonce,
    p_user_id: state.userId,
    p_org_id: state.organizationId,
  });

  if (nonceRpcError || !consumedSuccessfully) {
    console.error(
      `[Google Calendar OAuth] Replay attack or invalid nonce: ${state.nonce}. Detail:`,
      nonceRpcError?.message || "Nonce already consumed, expired or non-existent"
    );
    return NextResponse.redirect(`${baseUrl}/app/settings?error=replay_detected`);
  }

  // 3. Direct verification of initiating user's active admin membership
  // Query agents directly to avoid service-role auth.uid() null mismatches
  const { data: memberRecord, error: memberErr } = await adminClient
    .from("agents")
    .select("id, extra")
    .eq("organization_id", state.organizationId)
    .eq("user_id", state.userId)
    .maybeSingle();

  const extra = (memberRecord?.extra as Record<string, any>) || {};
  const role = extra.role || "member";
  const status = extra.status || "active";
  const isAdmin = !memberErr && memberRecord && status === "active" && (role === "admin" || role === "owner");

  if (!isAdmin) {
    console.error(`[Google Calendar OAuth] User ${state.userId} is not active admin/owner of org ${state.organizationId}`);
    return NextResponse.redirect(`${baseUrl}/app/settings?error=unauthorized_tenant`);
  }

  try {
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("code", code);
    params.append("redirect_uri", redirectUri);
    params.append("grant_type", "authorization_code");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!tokenRes.ok) {
      throw new Error("Failed to exchange auth code for tokens: " + (await tokenRes.text()));
    }

    const tokenData = await tokenRes.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // 4. Safe upsert matching database's nullable-resource uniqueness design
    // Query existing connection to preserve refresh_token if Google omitted it
    let query = adminClient
      .from("google_calendar_connections")
      .select("id, refresh_token")
      .eq("organization_id", state.organizationId);

    if (state.resourceId) {
      query = query.eq("resource_id", state.resourceId);
    } else {
      query = query.is("resource_id", null);
    }

    const { data: existing } = await query.maybeSingle();
    const refreshTokenToSave = tokenData.refresh_token || existing?.refresh_token;

    if (!refreshTokenToSave) {
      console.warn("[Google Calendar OAuth] No refresh token provided or found in existing record.");
    }

    if (existing) {
      const { error: updateError } = await adminClient
        .from("google_calendar_connections")
        .update({
          access_token: tokenData.access_token,
          refresh_token: refreshTokenToSave || "",
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await adminClient
        .from("google_calendar_connections")
        .insert({
          organization_id: state.organizationId,
          resource_id: state.resourceId || null,
          access_token: tokenData.access_token,
          refresh_token: refreshTokenToSave || "",
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
    }

    console.log(`[Google Calendar OAuth] Successfully connected calendar for org ${state.organizationId}`);
    return NextResponse.redirect(`${baseUrl}/app/settings?success=calendar_connected`);
  } catch (err: any) {
    console.error("[Google Calendar OAuth] Exception during token exchange or storage:", err);
    return NextResponse.redirect(`${baseUrl}/app/settings?error=calendar_store_failed`);
  }
}
