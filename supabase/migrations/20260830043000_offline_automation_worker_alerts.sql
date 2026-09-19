-- Reconciles privacy-safe worker health alerts even when no browser is open.
-- No patient, appointment, message or WhatsApp content is read or inserted here.
create or replace function private.reconcile_automation_worker_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  -- Close an operational alert as soon as its run no longer needs attention.
  update public.app_notifications n
  set read_at = now()
  where n.entity_type = 'automation_worker_attention'
    and n.read_at is null
    and not exists (
      select 1
      from public.automation_runs r
      where r.id = n.entity_id
        and r.organization_id = n.organization_id
        and (
          (r.status = 'processing' and r.started_at < now() - interval '15 minutes')
          or (r.status in ('queued', 'retrying') and r.next_attempt_at < now() - interval '5 minutes')
        )
    );

  insert into public.app_notifications (
    organization_id, recipient_user_id, notification_type, title, body,
    href, entity_type, entity_id, priority, escalation_level
  )
  select
    r.organization_id,
    a.user_id,
    'serious_action',
    'Automation worker needs attention',
    'A clinic automation is delayed or still processing. Review worker health before reminders become failures.',
    '/app/automations',
    'automation_worker_attention',
    r.id,
    'high',
    1
  from public.automation_runs r
  join public.agents a
    on a.organization_id = r.organization_id
   and a.ai = false
   and a.user_id is not null
  where (
      (r.status = 'processing' and r.started_at < now() - interval '15 minutes')
      or (r.status in ('queued', 'retrying') and r.next_attempt_at < now() - interval '5 minutes')
    )
    and coalesce(a.extra->>'role', 'member') in ('owner', 'admin')
    and coalesce(a.extra->>'status', 'active') <> 'inactive'
    and not exists (
      select 1
      from public.app_notifications n
      where n.organization_id = r.organization_id
        and n.recipient_user_id = a.user_id
        and n.entity_type = 'automation_worker_attention'
        and n.entity_id = r.id
        and n.read_at is null
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.reconcile_automation_worker_alerts() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'reconcile-automation-worker-alerts') then
    perform cron.schedule(
      'reconcile-automation-worker-alerts',
      '* * * * *',
      'select private.reconcile_automation_worker_alerts();'
    );
  end if;
end
$$;

comment on function private.reconcile_automation_worker_alerts() is
  'Minute-by-minute, privacy-safe worker health notifications for organization owners and administrators.';
