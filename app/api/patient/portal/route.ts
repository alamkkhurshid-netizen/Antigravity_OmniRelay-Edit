import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

function adminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

const headers = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" };
const cookieName = "omnirelay_patient_session";

function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  return value ? decodeURIComponent(value.slice(cookieName.length + 1)) : "";
}

export async function GET(request: Request) {
  const linkToken = new URL(request.url).searchParams.get("token") ?? "";
  let sessionToken = cookieValue(request);
  if (!sessionToken && !/^[a-f0-9]{64}$/.test(linkToken)) return NextResponse.json({ error: "This secure link is invalid or has expired." }, { status: 400, headers });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Secure access is temporarily unavailable." }, { status: 503, headers });
  let expiresAt = "";
  if (!sessionToken) {
    const { data: exchange, error: exchangeError } = await admin.rpc("exchange_patient_portal_link", { p_token: linkToken });
    sessionToken = String(exchange?.access_token ?? "");
    expiresAt = String(exchange?.expires_at ?? "");
    if (exchangeError || !/^[a-f0-9]{64}$/.test(sessionToken)) {
      return NextResponse.json({ error: "This secure link is invalid, expired, or already used." }, { status: 403, headers });
    }
  }
  const { data, error } = await admin.rpc("get_patient_portal", { p_token: sessionToken });
  if (error || !data) return NextResponse.json({ error: "This secure link is invalid or has expired." }, { status: 403, headers });
  const { data: dataRequests } = await admin.rpc("get_patient_data_requests_from_portal", { p_token: sessionToken });
  const response = NextResponse.json({ ...data, data_requests: dataRequests ?? [] }, { headers });
  if (expiresAt) response.cookies.set(cookieName, sessionToken, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/api/patient/portal",
    expires: new Date(expiresAt),
  });
  return response;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { action?: string; appointmentId?: string; startsAt?: string; requestType?: string; summary?: string };
  const sessionToken = cookieValue(request);
  if (!/^[a-f0-9]{64}$/.test(sessionToken)) {
    return NextResponse.json({ error: "Invalid secure request." }, { status: 400, headers });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Secure access is temporarily unavailable." }, { status: 503, headers });
  if (body.action === "data_request") {
    if (!new Set(["access_export", "correction", "consent_withdrawal", "erasure"]).has(body.requestType ?? "") || typeof body.summary !== "string" || body.summary.trim().length < 5 || body.summary.trim().length > 1000) return NextResponse.json({ error: "Choose a request type and provide a short description." }, { status: 400, headers });
    const { data, error } = await admin.rpc("create_patient_data_request_from_portal", { p_token: sessionToken, p_request_type: body.requestType, p_summary: body.summary.trim() });
    if (error) return NextResponse.json({ error: error.message }, { status: 409, headers });
    return NextResponse.json({ ok: true, request: data }, { headers });
  }
  if (!/^[0-9a-f-]{36}$/.test(body.appointmentId ?? "")) return NextResponse.json({ error: "Invalid secure request." }, { status: 400, headers });
  const requestName = body.action === "cancel" ? "patient_portal_cancel" : body.action === "reschedule" ? "patient_portal_reschedule" : "";
  if (!requestName) return NextResponse.json({ error: "Unsupported action." }, { status: 400, headers });
  const args = requestName === "patient_portal_cancel"
    ? { p_token: sessionToken, p_appointment_id: body.appointmentId }
    : { p_token: sessionToken, p_appointment_id: body.appointmentId, p_starts_at: body.startsAt };
  const { error } = await admin.rpc(requestName, args);
  if (error) return NextResponse.json({ error: error.message }, { status: 409, headers });
  return NextResponse.json({ ok: true }, { headers });
}

export async function DELETE(request: Request) {
  const sessionToken = cookieValue(request);
  const admin = adminClient();
  if (admin && /^[a-f0-9]{64}$/.test(sessionToken)) {
    await admin.rpc("revoke_patient_portal_session", { p_token: sessionToken });
  }
  const response = NextResponse.json({ ok: true }, { headers });
  response.cookies.set(cookieName, "", {
    httpOnly: true, secure: true, sameSite: "strict", path: "/api/patient/portal", expires: new Date(0),
  });
  return response;
}
