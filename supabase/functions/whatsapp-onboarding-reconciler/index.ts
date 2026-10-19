import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const graphVersion = "v24.0";
const callbackUrl = `${url}/functions/v1/whatsapp-webhook`;

type Connection = {
  id: string;
  organization_id: string;
  status: string;
  external_phone_number_id: string | null;
  last_verified_at: string | null;
  capabilities: Record<string, unknown> | null;
};
type Address = {
  organization_id: string;
  address: string;
  extra: { access_token?: string; flow_type?: string; cloud_api_registered_at?: string; callback_url?: string } | null;
};

function statusOf(value?: string) {
  return String(value ?? "UNKNOWN").trim().toUpperCase();
}

async function reconcile(connection: Connection, address?: Address) {
  const phoneNumberId = connection.external_phone_number_id;
  const token = address?.extra?.access_token;
  if (!phoneNumberId || !token) return { checked: false, changed: false };

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok) {
    console.warn("[whatsapp-onboarding-reconciler] Meta status check failed", { organizationId: connection.organization_id, phoneNumberId, status: response.status });
    return { checked: false, changed: false };
  }
  const phone = await response.json() as { code_verification_status?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string };
  const verified = statusOf(phone.code_verification_status) === "VERIFIED";
  const registrationRequired = address?.extra?.flow_type === "new_phone_number" && !address.extra?.cloud_api_registered_at;
  const webhookAttached = address?.extra?.callback_url === callbackUrl;
  const checkedAt = new Date().toISOString();
  let nextStatus = "pending";
  let validationRequired = false;
  const existingValidationStartedAt = typeof connection.capabilities?.controlled_validation_started_at === "string"
    ? connection.capabilities.controlled_validation_started_at
    : null;
  // This must remain stable through the whole controlled-validation window.
  // Advancing the boundary on every scheduled check could split the inbound
  // and outbound proof across two checks and prevent automatic activation.
  const validationStartedAt = existingValidationStartedAt
    ?? (connection.status === "test" ? connection.last_verified_at : checkedAt);

  if (verified && webhookAttached && !registrationRequired) {
    const [{ count: inboundCount }, { count: deliveredCount }] = await Promise.all([
      db.from("messages").select("id", { count: "exact", head: true })
        .eq("organization_id", connection.organization_id).eq("service", "whatsapp").eq("direction", "incoming").gte("timestamp", validationStartedAt),
      db.from("messages").select("id", { count: "exact", head: true })
        .eq("organization_id", connection.organization_id).eq("service", "whatsapp").eq("direction", "outgoing")
        .gte("timestamp", validationStartedAt).not("status->delivered", "is", null),
    ]);
    nextStatus = inboundCount && deliveredCount ? "live" : "test";
    validationRequired = nextStatus === "test";
  }

  const capabilities = {
    ...(connection.capabilities ?? {}),
    embedded_signup: true,
    meta_phone_status: statusOf(phone.code_verification_status),
    meta_quality_rating: phone.quality_rating ?? null,
    meta_review_pending: nextStatus === "pending" && !registrationRequired,
    meta_registration_required: registrationRequired,
    meta_controlled_validation_required: validationRequired,
    meta_webhook_override_configured: webhookAttached,
    meta_last_reconciled_at: checkedAt,
    ...(nextStatus === "test" || nextStatus === "live" ? { controlled_validation_started_at: validationStartedAt } : {}),
    ...(nextStatus === "live" ? { controlled_validation_completed_at: checkedAt } : {}),
  };
  const changed = connection.status !== nextStatus;
  const { error } = await db.from("channel_connections").update({
    status: nextStatus,
    display_name: phone.verified_name ?? "WhatsApp Business",
    display_address: phone.display_phone_number ?? phoneNumberId,
    capabilities,
    last_verified_at: checkedAt,
    last_error: null,
    updated_at: checkedAt,
  }).eq("id", connection.id);
  if (error) throw error;

  if (changed) {
    await db.from("logs").insert({
      organization_id: connection.organization_id,
      organization_address: phoneNumberId,
      category: "signup",
      service: "whatsapp",
      level: "info",
      message: `WhatsApp onboarding status advanced to ${nextStatus}`,
      metadata: { meta_phone_status: statusOf(phone.code_verification_status), reconciled_at: checkedAt },
    });
  }
  return { checked: true, changed };
}

Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token || token !== serviceKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: connections, error } = await db.from("channel_connections")
    .select("id,organization_id,status,external_phone_number_id,last_verified_at,capabilities")
    .eq("channel", "whatsapp").eq("provider", "meta_cloud").in("status", ["pending", "test"]).order("updated_at", { ascending: true }).limit(25);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const organizationIds = [...new Set((connections ?? []).map((item) => item.organization_id))];
  const { data: addresses } = organizationIds.length
    ? await db.from("organizations_addresses").select("organization_id,address,extra")
      .eq("service", "whatsapp").eq("status", "connected").in("organization_id", organizationIds)
    : { data: [] as Address[] };
  const byKey = new Map((addresses ?? []).map((item) => [`${item.organization_id}:${item.address}`, item as Address]));
  let changed = 0;
  for (const connection of (connections ?? []) as Connection[]) {
    try {
      const result = await reconcile(connection, byKey.get(`${connection.organization_id}:${connection.external_phone_number_id}`));
      if (result.changed) changed++;
    } catch (cause) {
      console.error("[whatsapp-onboarding-reconciler] reconciliation failed", { organizationId: connection.organization_id, cause: String(cause) });
    }
  }
  return Response.json({ checked: connections?.length ?? 0, changed });
});