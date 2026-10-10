-- Privacy-safe OEM tenant health. Operators receive aggregate operational
-- signals only; patient, contact, message and credential data never crosses
-- the tenant boundary.

create table if not exists private.oem_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('tenant_health_viewed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table private.oem_audit_events enable row level security;
revoke all on private.oem_audit_events from public, anon, authenticated;

create index if not exists oem_audit_events_actor_time_idx
  on private.oem_audit_events (actor_user_id, created_at desc);

create or replace function public.get_oem_tenant_health()
returns table (
  organization_id uuid,
  organization_name text,
  business_category text,
  plan_id text,
  entitlement_status text,
  trial_ends_at timestamptz,
  location_count bigint,
  seat_count bigint,
  live_channel_count bigint,
  channel_attention_count bigint,
  appointment_count_30d bigint,
  conversation_count_30d bigint,
  failed_delivery_count_7d bigint,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_operator() then
    raise exception 'OEM operator access required' using errcode = '42501';
  end if;

  insert into private.oem_audit_events (actor_user_id, event_type, metadata)
  values (auth.uid(), 'tenant_health_viewed', jsonb_build_object('scope', 'aggregate_only'));

  return query
  select
    o.id,
    coalesce(nullif(trim(op.business_name), ''), o.name),
    coalesce(op.business_category, 'other'),
    coalesce(e.plan_id, 'unassigned'),
    coalesce(e.status, 'unassigned'),
    e.trial_ends_at,
    coalesce(loc.total, 0),
    coalesce(seats.total, 0),
    coalesce(ch.live_total, 0),
    coalesce(ch.attention_total, 0),
    coalesce(appt.total, 0),
    coalesce(conv.total, 0),
    coalesce(delivery.failed_total, 0),
    greatest(
      o.updated_at,
      coalesce(appt.last_at, o.updated_at),
      coalesce(conv.last_at, o.updated_at),
      coalesce(ch.last_at, o.updated_at)
    )
  from public.organizations o
  left join public.onboarding_profiles op on op.organization_id = o.id
  left join public.entitlements e on e.organization_id = o.id
  left join lateral (
    select count(*)::bigint as total
    from public.business_locations l
    where l.organization_id = o.id and l.active
  ) loc on true
  left join lateral (
    select count(*)::bigint as total
    from public.agents a
    where a.organization_id = o.id
      and coalesce(a.extra ->> 'active', 'true') <> 'false'
  ) seats on true
  left join lateral (
    select
      count(*) filter (where c.status in ('live', 'test'))::bigint as live_total,
      count(*) filter (where c.status in ('error', 'pending'))::bigint as attention_total,
      max(c.updated_at) as last_at
    from public.channel_connections c
    where c.organization_id = o.id
  ) ch on true
  left join lateral (
    select count(*)::bigint as total, max(a.updated_at) as last_at
    from public.appointments a
    where a.organization_id = o.id
      and a.created_at >= now() - interval '30 days'
  ) appt on true
  left join lateral (
    select count(*)::bigint as total, max(c.updated_at) as last_at
    from public.conversations c
    where c.organization_id = o.id
      and c.updated_at >= now() - interval '30 days'
  ) conv on true
  left join lateral (
    select count(*)::bigint as failed_total
    from public.reminder_events r
    where r.organization_id = o.id
      and r.status = 'failed'
      and r.updated_at >= now() - interval '7 days'
  ) delivery on true
  order by greatest(
    o.updated_at,
    coalesce(appt.last_at, o.updated_at),
    coalesce(conv.last_at, o.updated_at),
    coalesce(ch.last_at, o.updated_at)
  ) desc;
end;
$$;

revoke all on function public.get_oem_tenant_health() from public, anon;
grant execute on function public.get_oem_tenant_health() to authenticated;

comment on function public.get_oem_tenant_health() is
  'Returns privacy-safe aggregate tenant health to authenticated OEM operators and records an audit event.';
