import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { supabaseUrl } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWhatsAppStagingAllowed } from "@/lib/whatsapp-staging-guard";

type SignupPayload = {
  token?: string;
  code?: string;
  phoneNumberId?: string;
  wabaId?: string;
  businessId?: string;
  flowType?: "only_waba" | "new_phone_number" | "existing_phone_number";
};

export async function POST(request: Request) {
  // Fail closed unless the target environment and Supabase project are explicitly staging.
  if (!isWhatsAppStagingAllowed()) {
    return NextResponse.json(
      { error: "WhatsApp onboarding is strictly restricted to the staging environment." },
      { status: 403 }
    );
  }

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

  // Confirm Meta status before marking connections live
  let initialStatus = "pending_registration";
  if (payload.flowType === "existing_phone_number") {
    // For coexistence connections, confirm status with Meta before marking live
    try {
      const adminClient = createAdminClient();
      const { data: accessToken } = await adminClient.rpc("get_whatsapp_access_token", {
        p_organization_id: organization.id,
        p_phone_number_id: payload.phoneNumberId,
      });

      if (accessToken) {
        const graphVersion = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";
        const metaRes = await fetch(
          `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(payload.phoneNumberId)}?fields=status,code_verification_status`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          }
        );
        if (metaRes.ok) {
          const metaData = await metaRes.json().catch(() => ({})) as { status?: string; code_verification_status?: string };
          const metaStatus = String(metaData.status || "").toUpperCase();
          const metaVerify = String(metaData.code_verification_status || "").toUpperCase();
          if (metaStatus === "CONNECTED" || metaVerify === "VERIFIED") {
            initialStatus = "connected";
          } else {
            initialStatus = "pending_verification";
          }
        } else {
          initialStatus = "pending_verification";
        }
      } else {
        initialStatus = "pending_verification";
      }
    } catch {
      initialStatus = "pending_verification";
    }
  } else {
    // new_phone_number must complete two-step PIN registration before becoming connected
    initialStatus = "pending_registration";
  }

  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  // Scope upsert to exact organization_id, channel, provider and external_phone_number_id
  const { data: connectionRows, error: connError } = await adminClient
    .from("channel_connections")
    .upsert(
      {
        organization_id: organization.id,
        channel: "whatsapp",
        provider: "meta_cloud",
        status: initialStatus,
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
        last_verified_at: nowIso,
        last_error: null,
        updated_at: nowIso,
      },
      { onConflict: "organization_id,channel,provider" }
    )
    .select();

  if (connError || !connectionRows || connectionRows.length === 0) {
    await adminClient.from("logs").insert({
      organization_id: organization.id,
      organization_address: payload.phoneNumberId,
      category: "reconciliation_alert",
      service: "whatsapp",
      level: "error",
      message: "WhatsApp connected via Meta, but channel_connections upsert failed.",
    });
    return NextResponse.json(
      {
        error: "WhatsApp connected, but workspace synchronization failed.",
        status: "reconciliation_required",
        reconciliationRequired: true,
      },
      { status: 502 }
    );
  }

  // Auto-provision WhatsApp Booking Settings and Booking Page for zero-touch concierge activation
  try {
    await adminClient.from("whatsapp_booking_settings").upsert(
      {
        organization_id: organization.id,
        enabled: true,
        confirmation_mode: "instant",
        allow_secure_history: true,
        welcome_message: "Welcome. I can help you book an appointment, view an existing booking, or speak with our team.",
        session_timeout_minutes: 30,
        waitlist_offer_minutes: 30,
        patient_portal_base_url: "https://omnirelay.in",
        updated_at: nowIso,
      },
      { onConflict: "organization_id" }
    );

    const { data: page } = await adminClient
      .from("booking_pages")
      .select("slug")
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (!page) {
      const rawSlug = (organization.name || "clinic")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "clinic";
      const slug = `${rawSlug}-${organization.id.slice(0, 6)}`;
      await adminClient.from("booking_pages").insert({
        organization_id: organization.id,
        slug,
        headline: organization.name || "Clinic Appointments",
        description: "Official Online & WhatsApp Booking Page",
        accent_color: "#087fb9",
        active: true,
      });
    }
  } catch (provErr) {
    console.warn("Auto-provisioning concierge foundation error (non-fatal):", provErr);
  }

  return NextResponse.json({
    connected: true,
    status: initialStatus,
    phoneNumber: result.extra?.phone_number ?? result.address,
    verifiedName: result.extra?.verified_name,
  });
}
