create table if not exists public.saas_billing_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id text not null references public.saas_plans(id),
  created_by uuid references auth.users(id) on delete set null,
  provider text not null default 'razorpay' check (provider in ('razorpay')),
  provider_order_id text unique,
  provider_payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  receipt text not null unique,
  period_start timestamptz,
  period_end timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saas_billing_orders_org_created_idx
  on public.saas_billing_orders (organization_id, created_at desc);
create index if not exists saas_billing_orders_pending_idx
  on public.saas_billing_orders (created_at)
  where status = 'pending';

alter table public.saas_billing_orders enable row level security;
revoke all on public.saas_billing_orders from public, anon;
grant select on public.saas_billing_orders to authenticated;
drop policy if exists "organization members read billing orders" on public.saas_billing_orders;
create policy "organization members read billing orders"
  on public.saas_billing_orders for select to authenticated
  using (private.is_organization_member(organization_id, 'member'));

create table if not exists public.billing_notice_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notice_type text not null check (notice_type in ('trial_3_days','trial_1_day','trial_expired','renewal_due','payment_failed')),
  channel text not null default 'in_app' check (channel in ('in_app','email','whatsapp')),
  recipient text,
  status text not null default 'queued' check (status in ('queued','sent','failed','dismissed')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, notice_type, channel, scheduled_for)
);

create index if not exists billing_notice_events_org_idx
  on public.billing_notice_events (organization_id, scheduled_for desc);
alter table public.billing_notice_events enable row level security;
revoke all on public.billing_notice_events from public, anon;
grant select on public.billing_notice_events to authenticated;
drop policy if exists "organization members read billing notices" on public.billing_notice_events;
create policy "organization members read billing notices"
  on public.billing_notice_events for select to authenticated
  using (private.is_organization_member(organization_id, 'member'));

create or replace function public.activate_saas_subscription(
  p_provider_order_id text,
  p_provider_payment_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.saas_billing_orders%rowtype;
  v_plan public.saas_plans%rowtype;
  v_start timestamptz := now();
  v_end timestamptz := now() + interval '1 month';
begin
  select * into v_order from public.saas_billing_orders
  where provider_order_id = p_provider_order_id for update;
  if v_order.id is null then raise exception 'Billing order not found'; end if;
  if v_order.status = 'paid' then
    if v_order.provider_payment_id <> p_provider_payment_id then raise exception 'Payment reference mismatch'; end if;
    return jsonb_build_object('status','active','plan_id',v_order.plan_id,'period_end',v_order.period_end);
  end if;
  if v_order.status <> 'pending' then raise exception 'Billing order is not payable'; end if;
  if exists (select 1 from public.saas_billing_orders where provider_payment_id=p_provider_payment_id and id<>v_order.id) then
    raise exception 'Payment reference already used';
  end if;
  select * into v_plan from public.saas_plans where id=v_order.plan_id and active;
  if v_plan.id is null then raise exception 'Plan is unavailable'; end if;

  update public.saas_billing_orders set status='paid',provider_payment_id=p_provider_payment_id,
    paid_at=v_start,period_start=v_start,period_end=v_end,updated_at=v_start where id=v_order.id;
  update public.entitlements set plan_id=v_plan.id,max_workspaces=v_plan.max_locations,
    max_seats=v_plan.max_seats,conversations_quota=v_plan.conversations_quota,
    channels=v_plan.channels,features=v_plan.features,status='active',
    current_period_end=v_end,grace_ends_at=v_end+interval '3 days',cancel_at_period_end=false,updated_at=v_start
  where organization_id=v_order.organization_id;
  if not found then
    insert into public.entitlements(organization_id,plan_id,max_workspaces,max_seats,conversations_quota,channels,features,status,current_period_end,grace_ends_at)
    values(v_order.organization_id,v_plan.id,v_plan.max_locations,v_plan.max_seats,v_plan.conversations_quota,v_plan.channels,v_plan.features,'active',v_end,v_end+interval '3 days');
  end if;
  return jsonb_build_object('status','active','plan_id',v_plan.id,'plan_name',v_plan.name,'period_start',v_start,'period_end',v_end);
end;
$$;
revoke all on function public.activate_saas_subscription(text,text) from public, anon, authenticated;
grant execute on function public.activate_saas_subscription(text,text) to service_role;

create or replace function private.materialize_billing_notices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer := 0;
begin
  insert into public.billing_notice_events(organization_id,notice_type,channel,recipient,scheduled_for,metadata)
  select e.organization_id, x.notice_type, 'in_app', null, x.scheduled_for,
    jsonb_build_object('trial_ends_at',e.trial_ends_at)
  from public.entitlements e
  cross join lateral (values
    ('trial_3_days'::text, date_trunc('minute',e.trial_ends_at-interval '3 days')),
    ('trial_1_day'::text, date_trunc('minute',e.trial_ends_at-interval '1 day')),
    ('trial_expired'::text, date_trunc('minute',e.trial_ends_at))
  ) x(notice_type,scheduled_for)
  where e.status='trialing' and e.trial_ends_at is not null and x.scheduled_for <= now()+interval '4 days'
  on conflict do nothing;
  get diagnostics v_count = row_count;

  update public.entitlements set status='expired',updated_at=now()
  where status='trialing' and trial_ends_at < now();
  return v_count;
end;
$$;
revoke all on function private.materialize_billing_notices() from public, anon, authenticated;
grant execute on function private.materialize_billing_notices() to service_role;

select private.materialize_billing_notices();
select cron.unschedule(jobid) from cron.job where jobname='omnirelay-materialize-billing-notices';
select cron.schedule(
  'omnirelay-materialize-billing-notices',
  '15 0 * * *',
  'select private.materialize_billing_notices();'
);
