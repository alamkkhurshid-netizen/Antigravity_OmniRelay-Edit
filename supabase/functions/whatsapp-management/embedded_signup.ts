import * as log from "../_shared/logger.ts";
import { Json } from "../_shared/db_types.ts";
import { HTTPException } from "jsr:@hono/hono/http-exception";
import type {
  createClient,
  WhatsAppOrganizationAddressExtra,
} from "../_shared/supabase.ts";
import { ContentfulStatusCode } from "jsr:@hono/hono/utils/http-status";

const API_VERSION = "v24.0";
const APP_ID = Deno.env.get("META_APP_ID");
const APP_SECRET = Deno.env.get("META_APP_SECRET");

/** Normalize phone number to digits only (e.g., "+54 9 260 423 7115" -> "5492604237115") */
function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}

// Step 1: Exchange code for business access token
async function getBusinessAccessToken(
  app_id: string,
  app_secret: string,
  code: string,
): Promise<string> {
  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token?client_id=${app_id}&client_secret=${app_secret}&code=${code}`,
  );

  if (!response.ok) {
    throw new HTTPException(response.status as ContentfulStatusCode, {
      message: "Could not get business access token",
      cause: await response.json().catch(() => ({})),
    });
  }

  return (await response.json()).access_token;
}

// Step 1b: Debug token and validate scopes and WABA authorization
async function getDebugToken(
  app_id: string,
  app_secret: string,
  input_token: string,
): Promise<{
  is_valid: boolean;
  scopes?: string[];
  granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
}> {
  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/debug_token?input_token=${encodeURIComponent(input_token)}&access_token=${encodeURIComponent(`${app_id}|${app_secret}`)}`,
  );

  if (!response.ok) {
    throw new HTTPException(response.status as ContentfulStatusCode, {
      message: "Could not debug business access token with Meta",
      cause: await response.json().catch(() => ({})),
    });
  }

  const payload = await response.json();
  return payload.data || {};
}

// Step 1c: Fetch phone numbers belonging to WABA
async function getWabaPhoneNumbers(
  business_access_token: string,
  waba_id: string,
): Promise<Array<{ id: string; display_phone_number?: string }>> {
  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(waba_id)}/phone_numbers`,
    {
      headers: { Authorization: `Bearer ${business_access_token}` },
    },
  );

  if (!response.ok) {
    throw new HTTPException(response.status as ContentfulStatusCode, {
      message: "Could not fetch WABA phone numbers from Meta",
      cause: await response.json().catch(() => ({})),
    });
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

// Step 2: Subscribe to webhooks
async function postSubscribeToWebhooks(
  business_access_token: string,
  waba_id: string,
  url?: string,
  token?: string,
): Promise<boolean> {
  let response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${waba_id}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${business_access_token}`,
      },
    },
  );

  if (!response.ok) {
    throw new HTTPException(response.status as ContentfulStatusCode, {
      message: "Could not subscribe to webhooks",
      cause: await response.json().catch(() => ({})),
    });
  }

  if (url && token) {
    response = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${waba_id}/subscribed_apps`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${business_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          override_callback_uri: url,
          verify_token: token,
        }),
      },
    );

    if (!response.ok) {
      throw new HTTPException(response.status as ContentfulStatusCode, {
        message: "Could not override callback URL",
        cause: await response.json().catch(() => ({})),
      });
    }
  }

  return (await response.json()).success;
}

// Step 3: Fetch phone number details
async function getPhoneNumber(
  business_access_token: string,
  phone_number_id: string,
): Promise<{
  code_verification_status: string;
  display_phone_number: string;
  id: string;
  quality_rating: string;
  verified_name: string;
}> {
  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${phone_number_id}`,
    {
      headers: { Authorization: `Bearer ${business_access_token}` },
    },
  );

  if (!response.ok) {
    throw new HTTPException(response.status as ContentfulStatusCode, {
      message: "Could not get phone number data",
      cause: await response.json().catch(() => ({})),
    });
  }

  return await response.json();
}

async function postInitDataSync(
  business_access_token: string,
  phone_number_id: string,
  type: "contacts" | "messages",
): Promise<{
  messaging_product: "whatsapp";
  request_id: string;
}> {
  log.info(`Initiating app data sync for ${phone_number_id} ${type}`);

  const syncTypeMap = {
    contacts: "smb_app_state_sync",
    messages: "history",
  };

  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${phone_number_id}/smb_app_data`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${business_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        sync_type: syncTypeMap[type],
      }),
    },
  );

  if (!response.ok) {
    throw new HTTPException(response.status as ContentfulStatusCode, {
      message: `Could not initiate ${type} app data synchronization`,
      cause: await response.json().catch(() => ({})),
    });
  }

  return await response.json();
}

export type SignupPayload = {
  code: string;
  application_id?: string;
  organization_id: string;
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
  flow_type?: "only_waba" | "new_phone_number" | "existing_phone_number";
  callback_url?: string;
  verify_token?: string;
};

export async function performEmbeddedSignup(
  client: ReturnType<typeof createClient>,
  payload: SignupPayload,
) {
  if (!payload.code) {
    throw new HTTPException(400, { message: "Missing 'code' body param!" });
  }

  if (!payload.organization_id) {
    throw new HTTPException(400, {
      message: "Missing 'organization_id' body param!",
    });
  }

  if (!payload.waba_id) {
    throw new HTTPException(400, {
      message: "Missing 'waba_id' body param!",
    });
  }

  if (!payload.phone_number_id) {
    throw new HTTPException(400, {
      message: "Missing 'phone_number_id' body param!",
    });
  }

  if (!APP_ID || !APP_SECRET) {
    throw new HTTPException(401, {
      message: "META_APP_ID or META_APP_SECRET environment variable not set",
    });
  }

  const ids = APP_ID.split("|");
  const secrets = APP_SECRET.split("|");

  if (ids.length !== secrets.length) {
    throw new HTTPException(500, {
      message:
        "META_APP_ID and META_APP_SECRET environment variables must have the same number of elements, separated by '|'",
    });
  }

  let idIndex = 0;
  if (payload.application_id) {
    idIndex = ids.indexOf(payload.application_id);
    if (idIndex === -1) {
      throw new HTTPException(500, {
        message:
          `Could not find application id '${payload.application_id}' in META_APP_ID environment variable`,
      });
    }
  }

  const app_id = ids[idIndex];
  const app_secret = secrets[idIndex];

  const ctx = {
    organization_id: payload.organization_id,
    phone_number_id: payload.phone_number_id,
    waba_id: payload.waba_id,
  };

  // 1. Initialize onboarding lifecycle run in whatsapp_onboarding_runs
  const { data: runRecord } = await client
    .from("whatsapp_onboarding_runs")
    .insert({
      organization_id: payload.organization_id,
      flow_type: payload.flow_type || "new_phone_number",
      waba_id: payload.waba_id,
      phone_number_id: payload.phone_number_id,
      status: "initiated",
      attempt_count: 1,
      metadata: { flow_type: payload.flow_type || "new_phone_number" },
    })
    .select("id")
    .maybeSingle();
  const runId = runRecord?.id;

  // Step 1: Exchange code for business token immediately
  log.info("Step 1: Exchange the token code for a business token", ctx);
  let business_access_token: string;
  try {
    business_access_token = await getBusinessAccessToken(
      app_id,
      app_secret,
      payload.code,
    );
    if (runId) {
      await client
        .from("whatsapp_onboarding_runs")
        .update({ status: "authorized", updated_at: new Date().toISOString() })
        .eq("id", runId);
    }
  } catch (err) {
    if (runId) {
      await client
        .from("whatsapp_onboarding_runs")
        .update({
          status: "failed_recoverable",
          sanitized_error: { step: "authorized", message: err instanceof Error ? err.message : String(err) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    throw err;
  }

  // Phase 3: Validate Meta Assets before accepting browser-provided identifiers
  try {
    log.info("Phase 3: Validating Meta assets via debug_token and phone list", ctx);
    // 3a. Call /debug_token
    const debugInfo = await getDebugToken(app_id, app_secret, business_access_token);
    if (!debugInfo.is_valid) {
      throw new HTTPException(400, { message: "Meta access token is invalid or expired" });
    }

    // 3b. Confirm required WhatsApp scopes
    const scopes = debugInfo.scopes || [];
    const hasRequiredScope = scopes.includes("whatsapp_business_management") || scopes.includes("whatsapp_business_messaging");
    if (!hasRequiredScope) {
      throw new HTTPException(403, { message: "Meta token missing required WhatsApp management scopes" });
    }

    // 3c. Confirm claimed WABA appears in granular_scopes.target_ids
    const granular = debugInfo.granular_scopes || [];
    const managementScope = granular.find(
      (g) => g.scope === "whatsapp_business_management" || g.scope === "whatsapp_business_messaging"
    );
    const targetIds = managementScope?.target_ids || [];
    if (targetIds.length > 0 && !targetIds.includes(payload.waba_id)) {
      throw new HTTPException(400, {
        message: `Claimed WABA ${payload.waba_id} is not authorized in token granular scopes`,
      });
    }

    // 3d. Fetch WABA phone numbers and confirm claimed phone ID belongs to that WABA
    const wabaPhones = await getWabaPhoneNumbers(business_access_token, payload.waba_id);
    const phoneMatch = wabaPhones.find((p) => p.id === payload.phone_number_id);
    if (!phoneMatch) {
      throw new HTTPException(400, {
        message: `Claimed phone number ID ${payload.phone_number_id} does not belong to WABA ${payload.waba_id}`,
      });
    }

    // 3e. Enforce global phone-number uniqueness across tenants
    const { data: existingCrossTenant } = await client
      .from("channel_connections")
      .select("id, organization_id")
      .eq("channel", "whatsapp")
      .eq("external_phone_number_id", payload.phone_number_id)
      .neq("organization_id", payload.organization_id)
      .maybeSingle();

    if (existingCrossTenant) {
      throw new HTTPException(409, {
        message: `Cross-tenant WhatsApp phone assignment rejected: phone_number_id ${payload.phone_number_id} is already registered to another organization`,
      });
    }

    if (runId) {
      await client
        .from("whatsapp_onboarding_runs")
        .update({ status: "assets_verified", updated_at: new Date().toISOString() })
        .eq("id", runId);
    }
  } catch (err) {
    if (runId) {
      await client
        .from("whatsapp_onboarding_runs")
        .update({
          status: "failed_recoverable",
          sanitized_error: { step: "assets_verified", message: err instanceof Error ? err.message : String(err) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    throw err;
  }

  // Step 2: Subscribe to webhooks on customer WABA
  log.info("Step 2: Subscribe to webhooks on the customer's WABA", ctx);
  try {
    await postSubscribeToWebhooks(
      business_access_token,
      payload.waba_id,
      payload.callback_url,
      payload.verify_token,
    );
    if (runId) {
      await client
        .from("whatsapp_onboarding_runs")
        .update({ status: "webhook_subscribed", updated_at: new Date().toISOString() })
        .eq("id", runId);
    }
  } catch (err) {
    if (runId) {
      await client
        .from("whatsapp_onboarding_runs")
        .update({
          status: "failed_recoverable",
          sanitized_error: { step: "webhook_subscribed", message: err instanceof Error ? err.message : String(err) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    throw err;
  }

  log.info(
    "Step 3: New numbers require owner PIN registration; coexistence bypasses /register",
    ctx,
  );

  log.info("Getting phone number data", ctx);
  const phone_number = await getPhoneNumber(
    business_access_token,
    payload.phone_number_id,
  );

  log.info("Persisting phone number data and sealed credentials", ctx);
  const { data: syncResult, error: syncError } = await client.rpc(
    "sync_whatsapp_signup",
    {
      p_organization_id: payload.organization_id,
      p_phone_number_id: payload.phone_number_id,
      p_waba_id: payload.waba_id,
      p_display_phone_number: normalizePhoneNumber(phone_number.display_phone_number),
      p_verified_name: phone_number.verified_name,
      p_flow_type: payload.flow_type || "new_phone_number",
      p_access_token: business_access_token,
      p_business_id: payload.business_id || null,
      p_code_verification_status: phone_number.code_verification_status,
      p_quality_rating: phone_number.quality_rating,
    },
  );

  if (syncError || !syncResult?.success) {
    log.error("Failed to execute atomic sync_whatsapp_signup RPC", syncError);
    if (runId) {
      await client
        .from("whatsapp_onboarding_runs")
        .update({
          status: "failed_recoverable",
          sanitized_error: { step: "sync_whatsapp_signup", message: syncError?.message || "Sync RPC failed" },
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    throw new HTTPException(500, {
      message: "Could not persist WhatsApp signup synchronization",
      cause: syncError,
    });
  }

  // Determine final run status: new numbers stay in pending_registration until owner completes PIN registration
  const finalRunStatus = payload.flow_type === "existing_phone_number"
    ? (syncResult.status === "connected" ? "connected" : "pending_verification")
    : "pending_registration";

  if (runId) {
    await client
      .from("whatsapp_onboarding_runs")
      .update({ status: finalRunStatus, updated_at: new Date().toISOString() })
      .eq("id", runId);
  }

  const data = {
    address: payload.phone_number_id,
    organization_id: payload.organization_id,
    service: "whatsapp",
    status: syncResult.status,
    extra: {
      phone_number: normalizePhoneNumber(phone_number.display_phone_number),
      verified_name: phone_number.verified_name,
      waba_id: payload.waba_id,
    },
  };

  log.info("Account connected to workspace", ctx);

  await client.from("logs").insert({
    organization_id: payload.organization_id,
    organization_address: data.address,
    category: "signup",
    service: "whatsapp",
    level: "info",
    message: "WhatsApp account onboarding initiated and verified",
  });

  // Coexistence data sync (messages and contacts)
  if (payload.flow_type === "existing_phone_number") {
    try {
      log.info("Step 4: Initiating contacts sync for coexistence", ctx);
      await postInitDataSync(
        business_access_token,
        payload.phone_number_id,
        "contacts",
      );
    } catch (error) {
      const cause = error instanceof HTTPException ? error.cause : error;
      log.warn(
        "Contacts sync failed (non-fatal): number connected, but historical contacts were not imported",
        { ...ctx, cause },
      );
      await client.from("logs").insert({
        organization_id: payload.organization_id,
        organization_address: payload.phone_number_id,
        category: "signup",
        service: "whatsapp",
        level: "warning",
        message: "Historical contacts were not imported (sync did not run)",
        metadata: cause as Json,
      });
    }

    try {
      log.info("Step 5: Initiating messages sync for coexistence", ctx);
      await postInitDataSync(
        business_access_token,
        payload.phone_number_id,
        "messages",
      );
    } catch (error) {
      const cause = error instanceof HTTPException ? error.cause : error;
      log.warn(
        "Messages sync failed (non-fatal): number connected, but historical messages were not imported",
        { ...ctx, cause },
      );
      await client.from("logs").insert({
        organization_id: payload.organization_id,
        organization_address: payload.phone_number_id,
        category: "signup",
        service: "whatsapp",
        level: "warning",
        message: "Historical messages were not imported (sync did not run)",
        metadata: cause as Json,
      });
    }
  }

  return data;
}

async function deregisterPhoneNumber(
  business_access_token: string,
  phone_number_id: string,
): Promise<boolean> {
  log.info(`Deregistering phone number: ${phone_number_id}`);

  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${phone_number_id}/deregister`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${business_access_token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new HTTPException(response.status as ContentfulStatusCode, {
      message: "Could not deregister phone number",
      cause: await response.json().catch(() => ({})),
    });
  }

  return (await response.json()).success;
}

export async function deleteSignup(
  client: ReturnType<typeof createClient>,
  payload: { phone_number_id: string; organization_id: string },
) {
  const { phone_number_id, organization_id } = payload;

  const { data: organization_address } = await client
    .from("organizations_addresses")
    .select()
    .eq("organization_id", organization_id)
    .eq("address", phone_number_id)
    .single()
    .throwOnError();

  const extra =
    (organization_address.extra as WhatsAppOrganizationAddressExtra | null) ||
    {};

  if (extra.flow_type !== "new_phone_number") {
    throw new HTTPException(403, {
      message:
        "Cannot deregister organization address. Only new phone numbers can be deregistered.",
    });
  }

  await deregisterPhoneNumber(extra.access_token || "", phone_number_id);

  const { data } = await client
    .from("organizations_addresses")
    .update({
      status: "disconnected",
    })
    .eq("organization_id", organization_id)
    .eq("address", phone_number_id)
    .select()
    .single()
    .throwOnError();

  return data;
}
