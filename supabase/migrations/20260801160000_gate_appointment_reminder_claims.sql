create or replace function public.claim_due_appointment_reminders(p_limit integer default 20)
returns setof public.reminder_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select r.id
    from public.reminder_events r
    where r.channel = 'whatsapp'
      and r.status = 'scheduled'
      and r.scheduled_for <= now()
      and coalesce(r.next_attempt_at, r.scheduled_for) <= now()
      and r.attempts < r.max_attempts
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
