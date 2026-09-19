create table if not exists public.whatsapp_booking_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  confirmation_mode text not null default 'instant' check (confirmation_mode in ('instant','manual')),
  allow_secure_history boolean not null default true,
  welcome_message text not null default 'Welcome. I can help you book an appointment, view an existing booking, or request human assistance.',
  session_timeout_minutes integer not null default 30 check (session_timeout_minutes between 5 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_booking_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_address text not null,
  state text not null default 'welcome',
  context jsonb not null default '{}'::jsonb,
  last_message_id uuid references public.messages(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, conversation_id)
);

create table if not exists public.whatsapp_booking_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid references public.whatsapp_booking_sessions(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  patient_name text,
  patient_phone text,
  service_id uuid references public.organization_services(id),
  location_id uuid references public.business_locations(id),
  resource_id uuid references public.booking_resources(id),
  starts_at timestamptz,
  status text not null default 'collecting' check (status in ('collecting','pending_approval','confirmed','rejected','expired','cancelled')),
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_booking_sessions_expiry_idx on public.whatsapp_booking_sessions(expires_at);
create index if not exists whatsapp_booking_requests_org_status_idx on public.whatsapp_booking_requests(organization_id,status,created_at desc);

alter table public.whatsapp_booking_settings enable row level security;
alter table public.whatsapp_booking_sessions enable row level security;
alter table public.whatsapp_booking_requests enable row level security;

create policy "members read booking bot settings" on public.whatsapp_booking_settings for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "admins manage booking bot settings" on public.whatsapp_booking_settings for all to authenticated using (private.is_organization_member(organization_id,'admin')) with check (private.is_organization_member(organization_id,'admin'));
create policy "members read booking bot sessions" on public.whatsapp_booking_sessions for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "members read booking requests" on public.whatsapp_booking_requests for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "admins decide booking requests" on public.whatsapp_booking_requests for update to authenticated using (private.is_organization_member(organization_id,'admin')) with check (private.is_organization_member(organization_id,'admin'));

grant select,insert,update on public.whatsapp_booking_settings to authenticated;
grant select on public.whatsapp_booking_sessions to authenticated;
grant select,update on public.whatsapp_booking_requests to authenticated;

create or replace function private.invoke_whatsapp_booking_concierge()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.direction <> 'incoming' or new.service::text <> 'whatsapp' then return new; end if;
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='edge_functions_url') || '/whatsapp-booking-concierge',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='edge_functions_token')
    ),
    body := jsonb_build_object('message_id',new.id),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists invoke_whatsapp_booking_concierge on public.messages;
create trigger invoke_whatsapp_booking_concierge
after insert on public.messages for each row
when (new.direction = 'incoming' and new.service = 'whatsapp')
execute function private.invoke_whatsapp_booking_concierge();
