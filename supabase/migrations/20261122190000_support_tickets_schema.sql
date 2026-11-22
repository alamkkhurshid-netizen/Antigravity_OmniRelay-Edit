-- Support Tickets schema for user inquiries and escalation from OmniRelay Guide

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null,
  user_name text,
  user_phone text,
  subject text not null,
  message text not null,
  pathname text,
  chat_context jsonb,
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_org_idx on public.support_tickets (organization_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);

alter table public.support_tickets enable row level security;
grant select, insert, update on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;

drop policy if exists "authenticated users insert support tickets" on public.support_tickets;
create policy "authenticated users insert support tickets"
on public.support_tickets for insert to authenticated
with check (
  user_id = (select auth.uid())
  or organization_id is null
  or private.is_organization_member(organization_id, 'member')
);

drop policy if exists "members view own org support tickets" on public.support_tickets;
create policy "members view own org support tickets"
on public.support_tickets for select to authenticated
using (
  user_id = (select auth.uid())
  or (organization_id is not null and private.is_organization_member(organization_id, 'member'))
);
