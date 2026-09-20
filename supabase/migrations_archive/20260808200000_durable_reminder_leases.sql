-- Recoverable reminder leases and server-side API throttling.

alter table public.care_reminder_runs
  add column if not exists last_attempt_at timestamptz;

alter table public.care_reminder_runs
  drop constraint if exists care_reminder_runs_status_check;

alter table public.care_reminder_runs
  add constraint care_reminder_runs_status_check
  check (status in ('ready','approved','processing','sent','delivered','read','failed','skipped'));

create or replace function public.claim_due_care_reminder_runs(p_limit integer default 20)
returns setof public.care_reminder_runs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.care_reminder_runs
  set status = 'failed',
      next_attempt_at = null,
      failure_reason = 'Reminder worker lease expired after the maximum attempts.',
      updated_at = now()
  where status = 'processing'
    and last_attempt_at < now() - interval '10 minutes'
    and attempt_count >= max_attempts;

  return query
  with due as (
    select r.id
    from public.care_reminder_runs r
    where r.channel = 'whatsapp'
      and r.attempt_count < r.max_attempts
      and (
        (
          r.status = 'approved'
          and r.scheduled_for <= now()
          and coalesce(r.next_attempt_at, r.scheduled_for) <= now()
        )
        or (
          r.status = 'processing'
          and r.last_attempt_at < now() - interval '10 minutes'
        )
      )
    order by r.scheduled_for
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.care_reminder_runs r
  set status = 'processing',
      attempt_count = r.attempt_count + 1,
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  from due
  where r.id = due.id
  returning r.*;
end;
$$;

revoke all on function public.claim_due_care_reminder_runs(integer) from public, anon, authenticated;
grant execute on function public.claim_due_care_reminder_runs(integer) to service_role;

create or replace function public.claim_due_appointment_reminders(p_limit integer default 20)
returns setof public.reminder_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reminder_events
  set status = 'failed',
      next_attempt_at = null,
      failure_reason = 'Reminder worker lease expired after the maximum attempts.',
      updated_at = now()
  where status = 'processing'
    and last_attempt_at < now() - interval '10 minutes'
    and attempts >= max_attempts;

  return query
  with due as (
    select r.id
    from public.reminder_events r
    where r.channel = 'whatsapp'
      and r.attempts < r.max_attempts
      and (
        (
          r.status = 'scheduled'
          and r.scheduled_for <= now()
          and coalesce(r.next_attempt_at, r.scheduled_for) <= now()
        )
        or (
          r.status = 'processing'
          and r.last_attempt_at < now() - interval '10 minutes'
        )
      )
      and exists (
        select 1 from public.channel_message_templates t
        where t.organization_id = r.organization_id
          and t.channel = 'whatsapp'
          and t.event_type = r.event_type
          and t.status = 'approved'
      )
      and exists (
        select 1 from public.organizations_addresses a
        where a.organization_id = r.organization_id
          and a.service = 'whatsapp'
          and a.status = 'connected'
      )
      and exists (
        select 1 from public.booking_pages b
        where b.organization_id = r.organization_id and b.active
      )
    order by r.scheduled_for
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.reminder_events r
  set status = 'processing',
      attempts = r.attempts + 1,
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  from due
  where r.id = due.id
  returning r.*;
end;
$$;

revoke all on function public.claim_due_appointment_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(integer) to service_role;

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  window_start timestamptz;
  current_hits integer;
begin
  if actor is null then raise exception 'authentication required'; end if;
  if p_bucket not in (
      'team_invite','team_role_change','team_deactivate','team_reactivate',
      'billing_order','conversation_start'
    )
    or p_limit < 1 or p_limit > 100
    or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.api_rate_limits (actor_user_id, bucket, window_started_at)
  values (actor, p_bucket, window_start)
  on conflict (actor_user_id, bucket, window_started_at)
  do update set hit_count = private.api_rate_limits.hit_count + 1, updated_at = now()
  returning hit_count into current_hits;

  return current_hits <= p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;
