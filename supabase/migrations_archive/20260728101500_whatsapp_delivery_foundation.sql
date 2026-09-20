create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram','email')),
  provider text not null check (provider in ('meta_cloud','open_bsp','resend')),
  status text not null default 'not_connected' check (status in ('not_connected','pending','test','live','error','disabled')),
  external_account_id text,
  external_phone_number_id text,
  display_name text,
  display_address text,
  capabilities jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,channel,provider)
);

create table public.channel_message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email')),
  event_type text not null check (event_type in ('confirmation','reminder_24h','reminder_2h','follow_up','cancellation','reschedule')),
  provider_template_name text not null,
  language_code text not null default 'en',
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','paused')),
  variable_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,channel,event_type,language_code)
);

alter table public.reminder_events
  add column provider_message_id text,
  add column connection_id uuid references public.channel_connections(id) on delete set null,
  add column last_attempt_at timestamptz,
  add column sent_at timestamptz,
  add column delivered_at timestamptz,
  add column read_at timestamptz;

create index reminder_events_dispatch
  on public.reminder_events (channel,status,scheduled_for)
  where status in ('scheduled','processing');
create index reminder_events_provider_message
  on public.reminder_events (provider_message_id)
  where provider_message_id is not null;

alter table public.channel_connections enable row level security;
alter table public.channel_message_templates enable row level security;
grant select,insert,update,delete on public.channel_connections to authenticated;
grant select,insert,update,delete on public.channel_message_templates to authenticated;

create policy "members read channel connections"
on public.channel_connections for select to authenticated
using (private.is_organization_member(organization_id,'member'));
create policy "owners manage channel connections"
on public.channel_connections for all to authenticated
using (private.is_organization_member(organization_id,'owner'))
with check (private.is_organization_member(organization_id,'owner'));
create policy "members read message templates"
on public.channel_message_templates for select to authenticated
using (private.is_organization_member(organization_id,'member'));
create policy "admins manage message templates"
on public.channel_message_templates for all to authenticated
using (private.is_organization_member(organization_id,'admin'))
with check (private.is_organization_member(organization_id,'admin'));

insert into public.channel_connections(organization_id,channel,provider,status,display_name)
select id,'whatsapp','meta_cloud','not_connected','WhatsApp Business'
from public.organizations on conflict do nothing;

insert into public.channel_message_templates(organization_id,channel,event_type,provider_template_name,language_code,status,variable_map)
select o.id,'whatsapp',v.event_type,v.template_name,'en','draft',v.variable_map
from public.organizations o
cross join (values
  ('confirmation','omnirelay_booking_confirmation','{"1":"patient_name","2":"business_name","3":"appointment_time","4":"location_name","5":"manage_url"}'::jsonb),
  ('reminder_24h','omnirelay_appointment_reminder','{"1":"patient_name","2":"business_name","3":"appointment_time","4":"location_name","5":"manage_url"}'::jsonb),
  ('reminder_2h','omnirelay_appointment_reminder','{"1":"patient_name","2":"business_name","3":"appointment_time","4":"location_name","5":"manage_url"}'::jsonb),
  ('cancellation','omnirelay_booking_change','{"1":"patient_name","2":"business_name","3":"reason","4":"manage_url"}'::jsonb),
  ('reschedule','omnirelay_booking_change','{"1":"patient_name","2":"business_name","3":"appointment_time","4":"manage_url"}'::jsonb),
  ('follow_up','omnirelay_follow_up','{"1":"patient_name","2":"business_name","3":"follow_up_note","4":"booking_url"}'::jsonb)
) as v(event_type,template_name,variable_map)
on conflict do nothing;
