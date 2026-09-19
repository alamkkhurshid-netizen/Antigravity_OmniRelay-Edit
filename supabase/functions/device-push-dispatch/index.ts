import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "";
const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "";
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

type Delivery = {
  delivery_id: string; subscription_id: string; endpoint: string; p256dh_key: string; auth_key: string;
  title: string; body: string; href: string; notification_id: string; attempts: number; max_attempts: number;
};

function safePayload(item: Delivery) {
  return JSON.stringify({
    title: item.title.slice(0, 120),
    body: item.body.slice(0, 240),
    href: item.href.startsWith("/") ? item.href : "/app/action-centre",
    tag: `omnirelay-serious-action-${item.notification_id}`,
  });
}

async function finish(item: Delivery, result: "delivered" | "failed", reason?: string, retryable = false) {
  const exhausted = item.attempts >= item.max_attempts;
  await db.from("device_push_deliveries").update({
    status: result === "delivered" ? "delivered" : retryable && !exhausted ? "queued" : "failed",
    next_attempt_at: result === "delivered" || !retryable || exhausted ? null : new Date(Date.now() + Math.min(60, item.attempts * 5) * 60_000).toISOString(),
    delivered_at: result === "delivered" ? new Date().toISOString() : null,
    failure_reason: reason ?? null,
    provider_response: { outcome: result, attempt: item.attempts },
    updated_at: new Date().toISOString(),
  }).eq("id", item.delivery_id).eq("status", "processing");
}

Deno.serve(async (request) => {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token || token !== serviceKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
      console.error("Device push dispatch is unavailable: VAPID configuration is missing.");
      return Response.json({ error: "Web Push VAPID configuration is required." }, { status: 503 });
    }
    let webpush: (typeof import("npm:web-push@3.6.7"))["default"];
    try {
      // Import only after configuration has been checked. A package-load failure
      // must never take down the scheduled worker before it can report a cause.
      webpush = (await import("npm:web-push@3.6.7")).default;
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } catch (error) {
      console.error("Device push dispatch is unavailable: VAPID configuration or provider is invalid.", error);
      return Response.json({ error: "Web Push VAPID configuration or provider is unavailable." }, { status: 503 });
    }

    const { data, error } = await db.rpc("claim_due_device_push_deliveries", { p_limit: 20 });
    if (error) {
      console.error("Unable to claim device push deliveries.", error);
      return Response.json({ error: "Unable to claim device push deliveries." }, { status: 500 });
    }
    let delivered = 0, retrying = 0, failed = 0;
    for (const raw of data ?? []) {
      const item = raw as Delivery;
      try {
        await webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh_key, auth: item.auth_key } }, safePayload(item), { TTL: 300, urgency: "high" });
        await finish(item, "delivered"); delivered++;
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
        const expired = statusCode === 404 || statusCode === 410;
        if (expired) await db.from("device_push_subscriptions").update({ status: "expired", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", item.subscription_id).eq("status", "active");
        const retryable = !expired && (statusCode === 0 || statusCode === 429 || statusCode >= 500);
        await finish(item, "failed", expired ? "Device subscription expired." : "Push provider delivery failed.", retryable);
        if (retryable) retrying++; else failed++;
      }
    }
    return Response.json({ processed: data?.length ?? 0, delivered, retrying, failed });
  } catch (error) {
    console.error("Unexpected device push dispatcher failure.", error);
    return Response.json({ error: "Device push dispatcher failed safely." }, { status: 500 });
  }
});
