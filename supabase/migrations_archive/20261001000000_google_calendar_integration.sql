create table if not exists public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid references public.booking_resources(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index google_calendar_connections_org_resource_idx
  on public.google_calendar_connections (organization_id, coalesce(resource_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.google_calendar_connections enable row level security;
grant select, insert, update, delete on public.google_calendar_connections to authenticated;
create policy "Admins can manage calendar connections"
  on public.google_calendar_connections for all to authenticated
  using (private.is_organization_member(organization_id, 'admin'))
  with check (private.is_organization_member(organization_id, 'admin'));

create table if not exists public.google_calendar_events (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  event_id text not null,
  synced_at timestamptz not null default now()
);

alter table public.google_calendar_events enable row level security;
grant select on public.google_calendar_events to authenticated;
create policy "Admins can view calendar events"
  on public.google_calendar_events for select to authenticated
  using (exists (
    select 1 from public.appointments a 
    where a.id = appointment_id and private.is_organization_member(a.organization_id, 'admin')
  ));
grant all on public.google_calendar_events to service_role;

create table if not exists public.google_calendar_sync_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  action text not null check (action in ('insert', 'update', 'delete')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (appointment_id, action)
);

create index google_calendar_sync_queue_poll_idx
  on public.google_calendar_sync_queue (next_attempt_at)
  where status = 'queued';

alter table public.google_calendar_sync_queue enable row level security;
grant all on public.google_calendar_sync_queue to service_role;

create or replace function private.queue_google_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.google_calendar_sync_queue (organization_id, appointment_id, action)
    values (old.organization_id, old.id, 'delete')
    on conflict (appointment_id, action) do update set status = 'queued', attempts = 0, next_attempt_at = now();
    return old;
  elsif tg_op = 'INSERT' then
    insert into public.google_calendar_sync_queue (organization_id, appointment_id, action)
    values (new.organization_id, new.id, 'insert')
    on conflict (appointment_id, action) do nothing;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.starts_at <> new.starts_at or old.ends_at <> new.ends_at or old.status <> new.status or old.customer_name <> new.customer_name or coalesce(old.notes,'') <> coalesce(new.notes,'') then
      insert into public.google_calendar_sync_queue (organization_id, appointment_id, action)
      values (new.organization_id, new.id, 'update')
      on conflict (appointment_id, action) do update set status = 'queued', attempts = 0, next_attempt_at = now();
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists queue_google_calendar_sync_trigger on public.appointments;
create trigger queue_google_calendar_sync_trigger
after insert or update or delete on public.appointments
for each row execute function private.queue_google_calendar_sync();

-- Edge function claim RPC
create or replace function private.claim_google_calendar_sync_jobs(p_limit integer default 20)
returns table (
  id uuid,
  organization_id uuid,
  appointment_id uuid,
  action text,
  attempts integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  return query
  with due as (
    select q.id
    from public.google_calendar_sync_queue q
    where q.status = 'queued'
      and q.next_attempt_at <= now()
      and q.attempts < q.max_attempts
    order by q.next_attempt_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.google_calendar_sync_queue q
  set status = 'processing',
      attempts = q.attempts + 1,
      updated_at = now()
  from due
  where q.id = due.id
  returning q.id, q.organization_id, q.appointment_id, q.action, q.attempts;
end;
$$;
revoke all on function private.claim_google_calendar_sync_jobs(integer) from public, anon, authenticated;
grant execute on function private.claim_google_calendar_sync_jobs(integer) to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'dispatch-google-calendar-sync') then
    perform cron.schedule(
      'dispatch-google-calendar-sync',
      '* * * * *',
      $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_url') || '/google-calendar-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_token')
        ),
        body := jsonb_build_object('scheduled_at', now()),
        timeout_milliseconds := 10000
      );
      $job$
    );
  end if;
end
$$;
