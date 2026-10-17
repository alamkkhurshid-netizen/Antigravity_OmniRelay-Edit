create sequence if not exists private.saas_invoice_number_seq;

create table if not exists public.saas_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_order_id uuid not null unique references public.saas_billing_orders(id) on delete restrict,
  invoice_number text not null unique,
  plan_id text not null references public.saas_plans(id),
  subtotal_paise integer not null check (subtotal_paise > 0),
  tax_paise integer not null default 0 check (tax_paise >= 0),
  total_paise integer not null check (total_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'paid' check (status in ('paid','void','refunded')),
  issued_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists saas_invoices_org_issued_idx
  on public.saas_invoices (organization_id, issued_at desc);
alter table public.saas_invoices enable row level security;
revoke all on public.saas_invoices from public, anon;
grant select on public.saas_invoices to authenticated;
drop policy if exists "organization members read invoices" on public.saas_invoices;
create policy "organization members read invoices"
  on public.saas_invoices for select to authenticated
  using (private.is_organization_member(organization_id, 'member'));

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  provider_event_id text not null unique,
  event_type text not null,
  provider_order_id text,
  provider_payment_id text,
  payload_digest text not null,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  failure_reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from public, anon, authenticated;

create or replace function private.issue_saas_invoice_after_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status='paid' and old.status is distinct from 'paid' then
    insert into public.saas_invoices(
      organization_id,billing_order_id,invoice_number,plan_id,
      subtotal_paise,total_paise,currency,period_start,period_end,metadata
    ) values (
      new.organization_id,new.id,
      'ORI-'||to_char(new.paid_at at time zone 'Asia/Kolkata','YYYYMM')||'-'||lpad(nextval('private.saas_invoice_number_seq')::text,6,'0'),
      new.plan_id,new.amount_paise,new.amount_paise,new.currency,new.period_start,new.period_end,
      jsonb_build_object('provider',new.provider,'provider_payment_id',new.provider_payment_id)
    ) on conflict (billing_order_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists issue_saas_invoice_after_payment on public.saas_billing_orders;
create trigger issue_saas_invoice_after_payment
after update of status on public.saas_billing_orders
for each row execute function private.issue_saas_invoice_after_payment();

insert into public.saas_invoices(
  organization_id,billing_order_id,invoice_number,plan_id,
  subtotal_paise,total_paise,currency,period_start,period_end,issued_at,metadata
)
select o.organization_id,o.id,
  'ORI-'||to_char(o.paid_at at time zone 'Asia/Kolkata','YYYYMM')||'-'||lpad(nextval('private.saas_invoice_number_seq')::text,6,'0'),
  o.plan_id,o.amount_paise,o.amount_paise,o.currency,o.period_start,o.period_end,o.paid_at,
  jsonb_build_object('provider',o.provider,'provider_payment_id',o.provider_payment_id)
from public.saas_billing_orders o
where o.status='paid' and o.period_start is not null and o.period_end is not null
on conflict (billing_order_id) do nothing;

insert into public.billing_notice_events(organization_id,notice_type,channel,scheduled_for,metadata)
select e.organization_id,'renewal_due','in_app',date_trunc('minute',e.current_period_end-interval '3 days'),
  jsonb_build_object('current_period_end',e.current_period_end)
from public.entitlements e
where e.status='active' and e.current_period_end is not null
  and e.current_period_end-interval '3 days' <= now()+interval '4 days'
on conflict do nothing;
