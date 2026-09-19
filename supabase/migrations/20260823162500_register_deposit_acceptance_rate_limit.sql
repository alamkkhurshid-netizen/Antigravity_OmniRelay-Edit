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
  if actor is null then
    raise exception 'authentication required';
  end if;

  if p_bucket not in (
    'team_invite',
    'team_role_change',
    'team_deactivate',
    'team_reactivate',
    'incident_create',
    'incident_update',
    'data_request_update',
    'doctor_bulk_import',
    'doctor_queue_setting',
    'doctor_queue_manual',
    'deposit_acceptance_prepare'
  ) or p_limit < 1 or p_limit > 100
    or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.api_rate_limits (
    actor_user_id,
    bucket,
    window_started_at
  ) values (
    actor,
    p_bucket,
    window_start
  )
  on conflict (actor_user_id, bucket, window_started_at)
  do update set
    hit_count = private.api_rate_limits.hit_count + 1,
    updated_at = now()
  returning hit_count into current_hits;

  return current_hits <= p_limit;
end
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to authenticated, service_role;
