import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { supabaseUrl } from "@/lib/supabase/config";

type SignupPayload = {
  token?: string;
  code?: string;
  phoneNumberId?: string;
  wabaId?: string;
  businessId?: string;
  flowType?: "only_waba" | "new_phone_number" | "existing_phone_number";
};

export async function POST(request: Request) {
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!organization) return NextResponse.json({ error: "Business workspace not found." }, { status: 409 });
  const { data: actor } = await supabase
    .from("agents")
    .select("extra")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (String((actor?.extra as { role?: string } | null)?.role ?? "member") !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can complete WhatsApp Business connection." }, { status: 403 });
  }

  const payload = await request.json() as SignupPayload;
  if (!payload.token || !payload.code || !payload.phoneNumberId || !payload.wabaId) {
    return NextResponse.json({ error: "Meta did not return all required connection details." }, { status: 400 });
  }
  const allowedFlowTypes = new Set(["only_waba", "new_phone_number", "existing_phone_number"]);
  if (payload.flowType && !allowedFlowTypes.has(payload.flowType)) {
    return NextResponse.json({ error: "Meta returned an unsupported onboarding mode." }, { status: 400 });
  }

  const { data: session } = await supabase
    .from("onboarding_tokens")
    .select("id,organization_id,status,expires_at")
    .eq("id", payload.token)
    .eq("organization_id", organization.id)
    .eq("service", "whatsapp")
    .maybeSingle();
  if (!session || session.status !== "active" || new Date(session.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This connection session expired. Please try again." }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-management/onboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: payload.token,
      code: payload.code,
      application_id: process.env.META_APP_ID,
      phone_number_id: payload.phoneNumberId,
      waba_id: payload.wabaId,
      business_id: payload.businessId,
      flow_type: payload.flowType ?? "new_phone_number",
    }),
  });
  const result = await response.json().catch(() => ({})) as {
    address?: string;
    extra?: { phone_number?: string; verified_name?: string };
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    return NextResponse.json({ error: result.message ?? result.error ?? "Meta could not connect this WhatsApp account." }, { status: response.status });
  }

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Server connection is incomplete." }, { status: 503 });
  const connectionResponse = await fetch(`${supabaseUrl}/rest/v1/channel_connections?on_conflict=organization_id,channel,provider`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      organization_id: organization.id,
      channel: "whatsapp",
      provider: "meta_cloud",
      status: "live",
      external_account_id: payload.wabaId,
      external_phone_number_id: payload.phoneNumberId,
      display_name: result.extra?.verified_name ?? "WhatsApp Business",
      display_address: result.extra?.phone_number ?? result.address ?? payload.phoneNumberId,
      capabilities: {
        embedded_signup: true,
        coexistence: payload.flowType === "existing_phone_number",
        onboarding_mode: payload.flowType ?? "new_phone_number",
        business_id: payload.businessId ?? null,
      },
      last_verified_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!connectionResponse.ok) {
    return NextResponse.json({ error: "WhatsApp connected, but workspace synchronization failed." }, { status: 502 });
  }
  return NextResponse.json({ connected: true, phoneNumber: result.extra?.phone_number ?? result.address, verifiedName: result.extra?.verified_name });
}
