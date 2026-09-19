-- Durable, privacy-safe delivery queue for opted-in staff devices.
-- This queue contains only the existing app-notification title/body/href.

create table if not exists public.device_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notification_id uuid not null references public.app_notifications(id) on delete cascade,
  subscription_id uuid not null references public.device_push_subscriptions(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','delivered','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, subscription_id)
);

create index if not exists device_push_deliveries_claim_idx
  on public.device_push_deliveries (next_attempt_at, created_at)
  where status = 'queued';

alter table public.device_push_deliveries enable row level security;
revoke all on public.device_push_deliveries from anon, authenticated;
grant select, insert, update, delete on public.device_push_deliveries to service_role;

create or replace function private.queue_device_push_deliveries()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.notification_type <> 'serious_action' then return new; end if;
  insert into public.device_push_deliveries(organization_id, notification_id, subscription_id)
  select new.organization_id, new.id, s.id
  from public.device_push_subscriptions s
  where s.organization_id = new.organization_id
    and s.user_id = new.recipient_user_id
    and s.status = 'active'
  on conflict (notification_id, subscription_id) do nothing;
  return new;
end;
$$;
revoke all on function private.queue_device_push_deliveries() from public, anon, authenticated;
grant execute on function private.queue_device_push_deliveries() to service_role;

drop trigger if exists queue_device_push_deliveries on public.app_notifications;
create trigger queue_device_push_deliveries
after insert on public.app_notifications
for each row execute function private.queue_device_push_deliveries();

create or replace function private.claim_due_device_push_deliveries(p_limit integer default 20)
returns table(
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh_key text, auth_key text,
  title text, body text, href text, notification_id uuid, attempts integer, max_attempts integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return query
  with claimed as (
    select d.id
    from public.device_push_deliveries d
    join public.device_push_subscriptions s on s.id = d.subscription_id and s.status = 'active'
    where d.status = 'queued' and d.next_attempt_at <= now()
    order by d.next_attempt_at, d.created_at
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ), updated as (
    update public.device_push_deliveries d
    set status = 'processing', attempts = d.attempts + 1, claimed_at = now(), updated_at = now()
    from claimed c where d.id = c.id
    returning d.*
  )
  select u.id, s.id, s.endpoint, s.p256dh_key, s.auth_key,
    n.title, coalesce(n.body, ''), coalesce(n.href, '/app/action-centre'), n.id, u.attempts, u.max_attempts
  from updated u
  join public.device_push_subscriptions s on s.id = u.subscription_id
  join public.app_notifications n on n.id = u.notification_id;
end;
$$;
revoke all on function private.claim_due_device_push_deliveries(integer) from public, anon, authenticated;
grant execute on function private.claim_due_device_push_deliveries(integer) to service_role;

comment on table public.device_push_deliveries is
  'Service-role-only delivery queue for opt-in, privacy-safe staff device alerts.';
