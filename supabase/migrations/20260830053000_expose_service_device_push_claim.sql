-- The Edge Function uses the PostgREST RPC surface. Keep the queue claim
-- implementation private, while exposing a service-role-only forwarding RPC.
create or replace function public.claim_due_device_push_deliveries(p_limit integer default 20)
returns table(
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh_key text, auth_key text,
  title text, body text, href text, notification_id uuid, attempts integer, max_attempts integer
)
language sql
security definer
set search_path = public, private
as $$
  select * from private.claim_due_device_push_deliveries(p_limit);
$$;

revoke all on function public.claim_due_device_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_due_device_push_deliveries(integer) to service_role;

comment on function public.claim_due_device_push_deliveries(integer) is
  'Service-role-only RPC bridge for the private durable device-push queue claim.';
