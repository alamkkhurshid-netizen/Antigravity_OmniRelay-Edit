import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  const resourceId = searchParams.get("resourceId");

  if (!organizationId) {
    return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
  }

  // 1. Authenticate initiating user session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized: Please sign in" }, { status: 401 });
  }

  // 2. Authorize: Verify initiator is admin of the target organization
  const { data: isMember } = await supabase.rpc("is_organization_member", {
    target_organization_id: organizationId,
    minimum_role: "admin",
  });
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden: Admin privileges required" }, { status: 403 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 500 });
  }

  // Determine the callback URL based on the request's origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

  // 3. Cryptographically signed, single-use, 10-minute expiring state nonce
  const statePayload = {
    organizationId,
    resourceId: resourceId || null,
    userId: user.id,
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000, // 10 minutes
  };

  const payloadStr = JSON.stringify(statePayload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");
  const signature = crypto.createHmac("sha256", clientSecret).update(payloadB64).digest("hex");
  const signedState = `${payloadB64}.${signature}`;

  // Persist nonce record to database to guarantee single-use across serverless instances
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = createAdminClient();
    await adminClient.from("oauth_nonces").insert({
      nonce: statePayload.nonce,
      user_id: user.id,
      organization_id: organizationId,
      resource_id: resourceId || null,
      provider: "google_calendar",
      expires_at: new Date(statePayload.exp).toISOString(),
    });
  } catch (dbErr) {
    console.warn("[Google Calendar OAuth] Could not persist state nonce to database:", dbErr);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.append("client_id", clientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", "https://www.googleapis.com/auth/calendar.events");
  authUrl.searchParams.append("access_type", "offline");
  authUrl.searchParams.append("prompt", "consent");
  authUrl.searchParams.append("state", signedState);

  return NextResponse.redirect(authUrl.toString());
}
