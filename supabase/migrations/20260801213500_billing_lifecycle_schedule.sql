create or replace function private.materialize_billing_notices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer := 0; v_added integer := 0;
begin
  insert into public.billing_notice_events(organization_id,notice_type,channel,recipient,scheduled_for,metadata)
  select e.organization_id, x.notice_type, 'in_app', null, x.scheduled_for,
    jsonb_build_object('trial_ends_at',e.trial_ends_at)
  from public.entitlements e
  cross join lateral (values
    ('trial_3_days'::text, date_trunc('minute',e.trial_ends_at-interval '3 days')),
    ('trial_1_day'::text, date_trunc('minute',e.trial_ends_at-interval '1 day')),
    ('trial_expired'::text, date_trunc('minute',e.trial_ends_at))
  ) x(notice_type,scheduled_for)
  where e.status='trialing' and e.trial_ends_at is not null and x.scheduled_for <= now()+interval '4 days'
  on conflict do nothing;
  get diagnostics v_count = row_count;

  insert into public.billing_notice_events(organization_id,notice_type,channel,recipient,scheduled_for,metadata)
  select e.organization_id,'renewal_due','in_app',null,
    date_trunc('minute',e.current_period_end-interval '3 days'),
    jsonb_build_object('current_period_end',e.current_period_end,'grace_ends_at',e.grace_ends_at)
  from public.entitlements e
  where e.status in ('active','past_due') and e.current_period_end is not null
    and e.current_period_end-interval '3 days' <= now()+interval '4 days'
  on conflict do nothing;
  get diagnostics v_added = row_count;
  v_count := v_count + v_added;

  update public.entitlements set status='expired',updated_at=now()
  where status='trialing' and trial_ends_at < now();
  update public.entitlements set status='past_due',
    grace_ends_at=greatest(coalesce(grace_ends_at,current_period_end+interval '3 days'),current_period_end+interval '3 days'),
    updated_at=now()
  where status='active' and current_period_end < now();
  update public.entitlements set status='expired',updated_at=now()
  where status='past_due' and grace_ends_at < now();
  return v_count;
end;
$$;
revoke all on function private.materialize_billing_notices() from public, anon, authenticated;
grant execute on function private.materialize_billing_notices() to service_role;
select private.materialize_billing_notices();
