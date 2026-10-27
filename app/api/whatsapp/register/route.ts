import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWhatsAppStagingAllowed } from "@/lib/whatsapp-staging-guard";

type RegisterPayload = {
  pin?: string;
  phoneNumberId?: string;
};

const COOLDOWN_MS = 30_000;

export async function POST(request: Request) {
  // 1. Fail closed unless explicit staging environment and staging Supabase host
  if (!isWhatsAppStagingAllowed()) {
    return NextResponse.json(
      { error: "WhatsApp registration is strictly restricted to the staging environment." },
      { status: 403 }
    );
  }

  // 2. Authenticate user and verify owner role
  const { supabase, organization } = await getWorkspace();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!organization) {
    return NextResponse.json({ error: "Business workspace not found." }, { status: 409 });
  }

  const { data: actor } = await supabase
    .from("agents")
    .select("extra")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (String((actor?.extra as { role?: string } | null)?.role ?? "member") !== "owner") {
    return NextResponse.json(
      { error: "Only the workspace owner can complete WhatsApp registration." },
      { status: 403 }
    );
  }

  // 3. Parse and validate PIN
  let payload: RegisterPayload;
  try {
    payload = await request.json() as RegisterPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawPin = payload.pin;
  if (typeof rawPin !== "string" || !/^\d{6}$/.test(rawPin)) {
    return NextResponse.json(
      { error: "Two-step verification PIN must be exactly six numeric digits." },
      { status: 400 }
    );
  }

  // 4. Locate the existing connection scoped to this workspace and phone number ID
  let connQuery = supabase
    .from("channel_connections")
    .select("*")
    .eq("organization_id", organization.id)
    .eq("channel", "whatsapp")
    .eq("provider", "meta_cloud");

  if (payload.phoneNumberId) {
    connQuery = connQuery.eq("external_phone_number_id", payload.phoneNumberId);
  }

  const { data: connection, error: connError } = await connQuery.maybeSingle();
  if (connError || !connection || !connection.external_phone_number_id) {
    return NextResponse.json(
      { error: "WhatsApp connection not found for this workspace and phone number ID." },
      { status: 404 }
    );
  }

  const targetPhoneId = connection.external_phone_number_id;

  // 5. Rate limiting and cooldown check
  const capabilities = (connection.capabilities || {}) as Record<string, unknown>;
  const lastAttemptIso = typeof capabilities.last_registration_attempt_at === "string"
    ? capabilities.last_registration_attempt_at
    : null;

  if (lastAttemptIso) {
    const elapsedMs = Date.now() - new Date(lastAttemptIso).getTime();
    if (elapsedMs < COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((COOLDOWN_MS - elapsedMs) / 1000);
      return NextResponse.json(
        {
          error: `Please wait ${retryAfterSeconds} second(s) before attempting registration again.`,
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
        }
      );
    }
  }

  // Record registration attempt timestamp and audit event (WITHOUT PIN)
  const attemptTimestamp = new Date().toISOString();
  await supabase
    .from("channel_connections")
    .update({
      capabilities: {
        ...capabilities,
        last_registration_attempt_at: attemptTimestamp,
      },
      updated_at: attemptTimestamp,
    })
    .eq("organization_id", organization.id)
    .eq("channel", "whatsapp")
    .eq("provider", "meta_cloud")
    .eq("external_phone_number_id", targetPhoneId);

  await supabase.from("audit_logs").insert({
    organization_id: organization.id,
    actor_id: user.id,
    action: "WHATSAPP_REGISTRATION_ATTEMPT",
    details: {
      channel: "whatsapp",
      provider: "meta_cloud",
      phone_number_id: targetPhoneId,
    },
  });

  // 6. Retrieve access token securely from Supabase Vault (server-only encrypted storage)
  let accessToken: string | null = null;
  try {
    const adminClient = createAdminClient();
    const { data: vaultToken, error: vaultError } = await adminClient.rpc(
      "get_whatsapp_access_token",
      {
        p_organization_id: organization.id,
        p_phone_number_id: targetPhoneId,
      }
    );
    if (!vaultError && typeof vaultToken === "string" && vaultToken.length > 0) {
      accessToken = vaultToken;
    }
  } catch {
    // Fall back to server-side check if adminClient initialization fails
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: "Stored WhatsApp connection credentials missing access token." },
      { status: 409 }
    );
  }

  const graphVersion = process.env.WHATSAPP_CLOUD_API_VERSION || "v24.0";

  // 7. Send POST /<PHONE_NUMBER_ID>/register securely to Meta Cloud API
  // IMPORTANT: rawPin is sent only in HTTPS request body; NEVER logged, returned or stored.
  try {
    const registerResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(targetPhoneId)}/register`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin: rawPin,
        }),
      }
    );

    if (!registerResponse.ok) {
      const errPayload = await registerResponse.json().catch(() => ({})) as { error?: Record<string, unknown> };
      const metaErr = errPayload.error || {};
      const sanitizedError = {
        message: typeof metaErr.message === "string" ? metaErr.message : "Meta registration failed.",
        type: typeof metaErr.type === "string" ? metaErr.type : "OAuthException",
        code: typeof metaErr.code === "number" ? metaErr.code : registerResponse.status,
        error_subcode: typeof metaErr.error_subcode === "number" ? metaErr.error_subcode : undefined,
        fbtrace_id: typeof metaErr.fbtrace_id === "string" ? metaErr.fbtrace_id : undefined,
      };

      // Keep status as pending_registration, record sanitized error for retry
      await supabase
        .from("channel_connections")
        .update({
          status: "pending_registration",
          last_error: sanitizedError.message,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organization.id)
        .eq("channel", "whatsapp")
        .eq("provider", "meta_cloud")
        .eq("external_phone_number_id", targetPhoneId);

      await supabase.from("audit_logs").insert({
        organization_id: organization.id,
        actor_id: user.id,
        action: "WHATSAPP_REGISTRATION_FAILED",
        details: {
          channel: "whatsapp",
          provider: "meta_cloud",
          phone_number_id: targetPhoneId,
          error: sanitizedError.message,
          code: sanitizedError.code,
        },
      });

      return NextResponse.json(
        {
          error: sanitizedError.message,
          sanitizedError,
          status: "pending_registration",
          allowRetry: true,
        },
        { status: 400 }
      );
    }

    // 8. Registration call succeeded. Query Meta to verify that status is CONNECTED
    const metaCheckResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(targetPhoneId)}?fields=status,code_verification_status,quality_rating,name_status`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    const metaPhone = await metaCheckResponse.json().catch(() => ({})) as {
      status?: string;
      code_verification_status?: string;
      quality_rating?: string;
      name_status?: string;
    };
    const metaStatus = String(metaPhone.status || "").toUpperCase();

    if (metaStatus === "CONNECTED") {
      const nowIso = new Date().toISOString();

      // Check database update result: update channel_connections
      const { data: updatedConns, error: updateConnError } = await supabase
        .from("channel_connections")
        .update({
          status: "live",
          last_verified_at: nowIso,
          last_error: null,
          updated_at: nowIso,
        })
        .eq("organization_id", organization.id)
        .eq("channel", "whatsapp")
        .eq("provider", "meta_cloud")
        .eq("external_phone_number_id", targetPhoneId)
        .select();

      // If Meta connects but database synchronization fails, return reconciliation state and alert
      if (updateConnError || !updatedConns || updatedConns.length === 0) {
        await supabase.from("logs").insert({
          organization_id: organization.id,
          organization_address: targetPhoneId,
          category: "reconciliation_alert",
          service: "whatsapp",
          level: "error",
          message: "Meta registration succeeded and reported CONNECTED, but channel_connections update failed.",
        });

        return NextResponse.json(
          {
            status: "reconciliation_required",
            error: "Meta registration completed, but database synchronization failed. Reconciliation required.",
            metaStatus: "CONNECTED",
            phoneNumberId: targetPhoneId,
            reconciliationRequired: true,
            allowRetry: false,
          },
          { status: 500 }
        );
      }

      // Update organizations_addresses status (WITHOUT storing tokens)
      const { data: updatedAddrs, error: updateAddrError } = await supabase
        .from("organizations_addresses")
        .update({
          status: "connected",
          updated_at: nowIso,
        })
        .eq("organization_id", organization.id)
        .eq("service", "whatsapp")
        .eq("address", targetPhoneId)
        .select();

      if (updateAddrError || !updatedAddrs || updatedAddrs.length === 0) {
        await supabase.from("logs").insert({
          organization_id: organization.id,
          organization_address: targetPhoneId,
          category: "reconciliation_alert",
          service: "whatsapp",
          level: "error",
          message: "Meta registration succeeded, but organizations_addresses update failed.",
        });

        return NextResponse.json(
          {
            status: "reconciliation_required",
            error: "Meta registration completed, but address synchronization failed. Reconciliation required.",
            metaStatus: "CONNECTED",
            phoneNumberId: targetPhoneId,
            reconciliationRequired: true,
            allowRetry: false,
          },
          { status: 500 }
        );
      }

      // Record successful registration audit event (WITHOUT PIN)
      await supabase.from("audit_logs").insert({
        organization_id: organization.id,
        actor_id: user.id,
        action: "WHATSAPP_REGISTRATION_SUCCESS",
        details: {
          channel: "whatsapp",
          provider: "meta_cloud",
          phone_number_id: targetPhoneId,
          meta_status: "CONNECTED",
        },
      });

      return NextResponse.json({
        success: true,
        status: "live",
        metaStatus: "CONNECTED",
        phoneNumberId: targetPhoneId,
        codeVerificationStatus: metaPhone.code_verification_status,
        nameStatus: metaPhone.name_status,
        qualityRating: metaPhone.quality_rating,
      });
    } else {
      // If Meta reports status other than CONNECTED, keep pending_registration
      await supabase
        .from("channel_connections")
        .update({
          status: "pending_registration",
          last_error: `Meta registration submitted, but phone status is currently ${metaStatus || "PENDING"}.`,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organization.id)
        .eq("channel", "whatsapp")
        .eq("provider", "meta_cloud")
        .eq("external_phone_number_id", targetPhoneId);

      return NextResponse.json({
        success: false,
        status: "pending_registration",
        metaStatus: metaStatus || "PENDING",
        message: `Registration accepted by Meta, but phone status is ${metaStatus || "PENDING"}.`,
        allowRetry: true,
      });
    }
  } catch (networkError) {
    const msg = networkError instanceof Error ? networkError.message : "Network error contacting Meta.";
    await supabase
      .from("channel_connections")
      .update({
        status: "pending_registration",
        last_error: msg,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization.id)
      .eq("channel", "whatsapp")
      .eq("provider", "meta_cloud")
      .eq("external_phone_number_id", targetPhoneId);

    return NextResponse.json(
      { error: msg, status: "pending_registration", allowRetry: true },
      { status: 502 }
    );
  }
}
