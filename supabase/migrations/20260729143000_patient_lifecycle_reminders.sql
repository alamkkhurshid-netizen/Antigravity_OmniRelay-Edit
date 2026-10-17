create table public.care_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  prescription_item_id uuid references public.prescription_items(id) on delete set null,
  encounter_id uuid references public.patient_encounters(id) on delete set null,
  reminder_type text not null check (reminder_type in ('medication','follow_up','test','care')),
  title text not null,
  instructions text,
  schedule_kind text not null check (schedule_kind in ('one_time','daily')),
  scheduled_for timestamptz,
  time_of_day time,
  starts_on date,
  ends_on date,
  timezone text not null default 'Asia/Kolkata',
  channel text not null default 'whatsapp' check (channel in ('whatsapp','email','manual')),
  status text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  consent_snapshot boolean not null default false,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (schedule_kind = 'one_time' and scheduled_for is not null)
    or
    (schedule_kind = 'daily' and time_of_day is not null and starts_on is not null)
  ),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.care_reminder_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reminder_id uuid not null references public.care_reminders(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  scheduled_for timestamptz not null,
  channel text not null check (channel in ('whatsapp','email','manual')),
  status text not null default 'ready'
    check (status in ('ready','approved','sent','delivered','read','failed','skipped')),
  attempt_count integer not null default 0,
  provider_message_id text,
  failure_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reminder_id, scheduled_for)
);

create index care_reminders_org_next_run_idx
  on public.care_reminders (organization_id, status, next_run_at);
create index care_reminders_patient_created_idx
  on public.care_reminders (patient_id, created_at desc);
create index care_reminder_runs_org_status_scheduled_idx
  on public.care_reminder_runs (organization_id, status, scheduled_for);

alter table public.care_reminders enable row level security;
alter table public.care_reminder_runs enable row level security;

grant select, insert, update on public.care_reminders to authenticated;
grant select, update on public.care_reminder_runs to authenticated;

create policy "members read care reminders"
on public.care_reminders for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create care reminders"
on public.care_reminders for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and created_by = auth.uid()
);

create policy "admins update care reminders"
on public.care_reminders for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (
  private.is_organization_member(organization_id, 'admin')
  and created_by = auth.uid()
);

create policy "members read care reminder runs"
on public.care_reminder_runs for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins update care reminder runs"
on public.care_reminder_runs for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

create or replace function private.materialize_due_care_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_count integer := 0;
begin
  with due as (
    select r.*
    from public.care_reminders r
    where r.status = 'active'
      and r.next_run_at <= now()
      and r.next_run_at >= now() - interval '24 hours'
    for update skip locked
  ), inserted as (
    insert into public.care_reminder_runs (
      organization_id, reminder_id, patient_id, scheduled_for, channel, status
    )
    select
      d.organization_id,
      d.id,
      d.patient_id,
      d.next_run_at,
      d.channel,
      case when d.consent_snapshot then 'ready' else 'skipped' end
    from due d
    on conflict (reminder_id, scheduled_for) do nothing
    returning 1
  ), advanced as (
    update public.care_reminders r
    set
      last_run_at = r.next_run_at,
      next_run_at = case
        when r.schedule_kind = 'daily'
          then r.next_run_at + interval '1 day'
        else r.next_run_at
      end,
      status = case
        when r.schedule_kind = 'one_time' then 'completed'
        when r.ends_on is not null
          and ((r.next_run_at + interval '1 day') at time zone r.timezone)::date > r.ends_on
          then 'completed'
        else r.status
      end,
      updated_at = now()
    from due d
    where r.id = d.id
    returning r.id
  )
  select count(*) into created_count from inserted;

  return created_count;
end;
$$;

revoke all on function private.materialize_due_care_reminders() from public, anon, authenticated;
grant execute on function private.materialize_due_care_reminders() to postgres;

select cron.schedule(
  'materialize-care-reminders',
  '*/5 * * * *',
  'select private.materialize_due_care_reminders();'
);
