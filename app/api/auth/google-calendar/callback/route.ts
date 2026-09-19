import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateStr = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/app/settings?error=calendar_auth_failed`);
  }

  if (!code || !stateStr) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  let state;
  try {
    state = JSON.parse(Buffer.from(stateStr, 'base64').toString('utf8'));
  } catch (e) {
    return NextResponse.json({ error: "Invalid state parameter" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 500 });
  }

  try {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });

    if (!tokenRes.ok) {
      throw new Error("Failed to exchange auth code for tokens: " + await tokenRes.text());
    }

    const tokenData = await tokenRes.json();
    
    // Store in Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const { error: upsertError } = await supabase.from("google_calendar_connections").upsert({
      organization_id: state.organizationId,
      resource_id: state.resourceId || null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    }, { onConflict: "organization_id, resource_id" });

    if (upsertError) {
      console.error("Failed to store calendar connection", upsertError);
      return NextResponse.redirect(`${baseUrl}/app/settings?error=calendar_store_failed`);
    }

    return NextResponse.redirect(`${baseUrl}/app/settings?success=calendar_connected`);

  } catch (err) {
    console.error("Google Calendar Callback Error:", err);
    return NextResponse.redirect(`${baseUrl}/app/settings?error=calendar_auth_failed`);
  }
}
