import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");
  const resourceId = searchParams.get("resourceId");

  if (!organizationId) {
    return NextResponse.json({ error: "Missing organizationId" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 500 });
  }

  // Determine the callback URL based on the request's origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

  const state = Buffer.from(JSON.stringify({ organizationId, resourceId })).toString('base64');

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.append("client_id", clientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", "https://www.googleapis.com/auth/calendar.events");
  authUrl.searchParams.append("access_type", "offline");
  authUrl.searchParams.append("prompt", "consent");
  authUrl.searchParams.append("state", state);

  return NextResponse.redirect(authUrl.toString());
}
