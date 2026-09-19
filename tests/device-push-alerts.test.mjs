import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const subscriptions = readFileSync(new URL("../supabase/migrations/20260824133836_device_push_subscriptions.sql", import.meta.url), "utf8");
const deliveries = readFileSync(new URL("../supabase/migrations/20260824134204_device_push_delivery_queue.sql", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/push-subscriptions/route.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../supabase/functions/device-push-dispatch/index.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../supabase/functions/device-push-config/index.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");

test("device subscriptions are opt-in, tenant bound and self-managed", () => {
  assert.match(subscriptions, /alter table public\.device_push_subscriptions enable row level security/);
  assert.match(subscriptions, /revoke all on public\.device_push_subscriptions from anon/);
  assert.match(subscriptions, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(subscriptions, /from public\.agents a/);
  assert.match(route, /getWorkspace/);
  assert.match(route, /endpoint\.startsWith\("https:\/\/"\)/);
  assert.match(route, /status: "revoked"/);
  assert.match(route, /eq\("user_id", user\.id\)/);
});

test("push delivery is durable, service-only and deduplicated", () => {
  assert.match(deliveries, /unique \(notification_id, subscription_id\)/);
  assert.match(deliveries, /for update of d skip locked/);
  assert.match(deliveries, /revoke all on public\.device_push_deliveries from anon, authenticated/);
  assert.match(deliveries, /grant execute on function private\.claim_due_device_push_deliveries\(integer\) to service_role/);
  assert.match(deliveries, /new\.notification_type <> 'serious_action'/);
});

test("push payload remains privacy safe and invalid devices are retired", () => {
  assert.doesNotMatch(dispatch, /patient_name|customer_name|customer_phone|diagnosis|prescription/i);
  assert.match(dispatch, /safePayload/);
  assert.match(dispatch, /href\.startsWith\("\/"\)/);
  assert.match(dispatch, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(dispatch, /status: "expired"/);
  assert.match(dispatch, /WEB_PUSH_VAPID_PRIVATE_KEY/);
  assert.match(shell, /device-push-config/);
  assert.match(config, /WEB_PUSH_VAPID_PUBLIC_KEY/);
  assert.doesNotMatch(config, /WEB_PUSH_VAPID_PRIVATE_KEY/);
  assert.doesNotMatch(shell, /WEB_PUSH_VAPID_PRIVATE_KEY/);
});
