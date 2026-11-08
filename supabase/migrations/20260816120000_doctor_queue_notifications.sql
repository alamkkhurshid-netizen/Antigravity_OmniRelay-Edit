alter table public.provider_profiles
  add column if not exists queue_notifications_enabled boolean not null default false,
  add column if not exists whatsapp_queue_consent_at timestamptz,
  add column if not exists whatsapp_queue_consent_notice_version text,
  add column if not exists whatsapp_queue_consent_recorded_by uuid references auth.users(id);

alter table public.channel_message_templates
  drop constraint if exists channel_message_templates_event_type_check;
alter table public.channel_message_templates
  add constraint channel_message_templates_event_type_check check (event_type in (
    'confirmation','reminder_24h','reminder_2h','follow_up','cancellation','reschedule',
    'care_campaign','marketing_campaign','emergency_notice','booking_otp','doctor_queue'
  ));

create table public.doctor_queue_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.booking_resources(id) on delete cascade,
  availability_rule_id uuid not null references public.availability_rules(id) on delete cascade,
  shift_date date not null,
  shift_starts_at timestamptz not null,
  scheduled_for timestamptz not null,
  recipient_phone text not null,
  booking_count integer not null default 0 check (booking_count >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','processing','queued','sent','delivered','read','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz,
  message_id uuid references public.messages(id) on delete set null,
  failure_reason text,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, availability_rule_id, shift_date)
);

create index doctor_queue_dispatches_due_idx
  on public.doctor_queue_dispatches (status, scheduled_for, next_attempt_at)
  where status in ('scheduled','failed');
create index doctor_queue_dispatches_org_idx
  on public.doctor_queue_dispatches (organization_id, shift_date desc);

alter table public.doctor_queue_dispatches enable row level security;
revoke all on public.doctor_queue_dispatches from public, anon;
grant select, insert, update on public.doctor_queue_dispatches to authenticated;

create policy "members read doctor queue dispatches"
on public.doctor_queue_dispatches for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create doctor queue dispatches"
on public.doctor_queue_dispatches for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update doctor queue dispatches"
on public.doctor_queue_dispatches for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

create or replace function public.materialize_due_doctor_queue_dispatches(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  local_date date := (p_now at time zone 'Asia/Kolkata')::date;
  inserted_count integer := 0;
begin
  insert into public.doctor_queue_dispatches (
    organization_id, resource_id, availability_rule_id, shift_date, shift_starts_at,
    scheduled_for, recipient_phone, booking_count, next_attempt_at
  )
  select
    r.organization_id, r.resource_id, r.id, local_date, shift.shift_at,
    shift.shift_at - interval '1 hour', private.normalize_phone_identity(pp.contact_phone),
    (select count(*)::integer from public.appointments a
      where a.organization_id=r.organization_id and a.resource_id=r.resource_id
        and a.starts_at >= shift.shift_at
        and a.starts_at < ((local_date + r.end_time) at time zone 'Asia/Kolkata')
        and a.status <> 'cancelled'),
    shift.shift_at - interval '1 hour'
  from public.availability_rules r
  join public.provider_profiles pp on pp.resource_id=r.resource_id and pp.organization_id=r.organization_id
  cross join lateral (select ((local_date + r.start_time) at time zone 'Asia/Kolkata') as shift_at) shift
  where r.active
    and r.weekday=extract(dow from local_date)::smallint
    and (r.effective_from is null or r.effective_from<=local_date)
    and (r.effective_to is null or r.effective_to>=local_date)
    and pp.queue_notifications_enabled
    and pp.whatsapp_queue_consent_at is not null
    and private.normalize_phone_identity(pp.contact_phone) is not null
    and shift.shift_at > p_now
    and shift.shift_at <= p_now + interval '70 minutes'
  on conflict (organization_id, availability_rule_id, shift_date) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

create or replace function public.schedule_doctor_queue_notification(
  p_organization_id uuid,
  p_availability_rule_id uuid,
  p_shift_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  rule_row public.availability_rules%rowtype;
  profile_row public.provider_profiles%rowtype;
  dispatch_row public.doctor_queue_dispatches%rowtype;
  shift_at timestamptz;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into rule_row from public.availability_rules
    where id=p_availability_rule_id and organization_id=p_organization_id and active;
  if not found then raise exception 'Scheduled doctor shift was not found'; end if;
  select * into profile_row from public.provider_profiles
    where resource_id=rule_row.resource_id and organization_id=p_organization_id;
  if not found or not profile_row.queue_notifications_enabled or profile_row.whatsapp_queue_consent_at is null then
    raise exception 'Doctor WhatsApp queue consent is not active';
  end if;
  if private.normalize_phone_identity(profile_row.contact_phone) is null then
    raise exception 'Doctor WhatsApp number is missing or invalid';
  end if;
  shift_at := ((p_shift_date + rule_row.start_time) at time zone 'Asia/Kolkata');
  insert into public.doctor_queue_dispatches (
    organization_id,resource_id,availability_rule_id,shift_date,shift_starts_at,
    scheduled_for,recipient_phone,booking_count,next_attempt_at
  ) values (
    p_organization_id,rule_row.resource_id,rule_row.id,p_shift_date,shift_at,
    now(),private.normalize_phone_identity(profile_row.contact_phone),
    (select count(*)::integer from public.appointments a where a.organization_id=p_organization_id
      and a.resource_id=rule_row.resource_id and a.starts_at>=shift_at
      and a.starts_at<((p_shift_date+rule_row.end_time) at time zone 'Asia/Kolkata') and a.status<>'cancelled'),now()
  ) on conflict (organization_id,availability_rule_id,shift_date) do nothing
  returning * into dispatch_row;
  if dispatch_row.id is null then
    select * into dispatch_row from public.doctor_queue_dispatches
      where organization_id=p_organization_id and availability_rule_id=p_availability_rule_id and shift_date=p_shift_date;
  end if;
  return jsonb_build_object('id',dispatch_row.id,'status',dispatch_row.status,'duplicate_prevented',dispatch_row.created_at < now()-interval '1 second');
end;
$function$;

create or replace function public.claim_due_doctor_queue_dispatches(p_limit integer default 20)
returns setof public.doctor_queue_dispatches
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
  with due as (
    select d.id from public.doctor_queue_dispatches d
    where d.status in ('scheduled','failed')
      and d.scheduled_for<=now() and coalesce(d.next_attempt_at,d.scheduled_for)<=now()
      and d.attempts<d.max_attempts
    order by d.scheduled_for for update skip locked limit least(greatest(p_limit,1),100)
  )
  update public.doctor_queue_dispatches d set status='processing',attempts=d.attempts+1,updated_at=now()
  from due where d.id=due.id returning d.*;
end;
$function$;

revoke all on function public.materialize_due_doctor_queue_dispatches(timestamptz) from public,anon,authenticated;
revoke all on function public.claim_due_doctor_queue_dispatches(integer) from public,anon,authenticated;
grant execute on function public.materialize_due_doctor_queue_dispatches(timestamptz) to service_role;
grant execute on function public.claim_due_doctor_queue_dispatches(integer) to service_role;
revoke all on function public.schedule_doctor_queue_notification(uuid,uuid,date) from public,anon;
grant execute on function public.schedule_doctor_queue_notification(uuid,uuid,date) to authenticated;

insert into public.channel_message_templates (
  organization_id,channel,event_type,provider_template_name,language_code,status,variable_map
)
select o.id,'whatsapp','doctor_queue','omnirelay_doctor_queue','en','draft',
  '{"1":"doctor_name","2":"clinic_name","3":"shift_and_chamber","4":"booking_count"}'::jsonb
from public.organizations o
on conflict do nothing;

do $block$
begin
  if exists (select 1 from pg_namespace where nspname='cron') then
    perform cron.schedule(
      'omnirelay-doctor-queue-dispatch',
      '*/5 * * * *',
      $job$
      select public.materialize_due_doctor_queue_dispatches(now());
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='edge_functions_url') || '/doctor-queue-dispatch',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='edge_functions_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
      $job$
    );
  end if;
end;
$block$;
