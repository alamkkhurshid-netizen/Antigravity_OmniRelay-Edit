-- Failed token checks roll back same-transaction counters in PostgreSQL.
-- Route booking-management actions through the server so the limiter commits
-- before the protected action is attempted.

create or replace function public.consume_public_server_rate_limit(
  p_bucket text,
  p_scope text,
  p_client_signal text,
  p_limit integer,
  p_window_seconds integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pepper text;
  digest_hex text;
  actor_id uuid;
  window_start timestamptz;
  current_hits integer;
begin
  if p_bucket not in (
      'public_booking_manage_lookup',
      'public_booking_identity',
      'public_booking_cancel',
      'public_booking_reschedule'
    )
    or p_limit < 1 or p_limit > 100
    or p_window_seconds < 60 or p_window_seconds > 3600
    or nullif(trim(coalesce(p_scope, '')), '') is null
    or nullif(trim(coalesce(p_client_signal, '')), '') is null then
    raise exception 'Invalid public server request limit';
  end if;

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  if nullif(pepper, '') is null then
    raise exception 'Public request protection is temporarily unavailable';
  end if;

  digest_hex := encode(
    extensions.hmac(
      p_bucket || '|' || lower(trim(p_scope)) || '|' || trim(p_client_signal),
      pepper,
      'sha256'
    ),
    'hex'
  );
  actor_id := (
    substr(digest_hex, 1, 8) || '-' || substr(digest_hex, 9, 4) || '-' ||
    substr(digest_hex, 13, 4) || '-' || substr(digest_hex, 17, 4) || '-' ||
    substr(digest_hex, 21, 12)
  )::uuid;
  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.api_rate_limits(actor_user_id,bucket,window_started_at)
  values(actor_id,p_bucket,window_start)
  on conflict(actor_user_id,bucket,window_started_at)
  do update set hit_count=private.api_rate_limits.hit_count+1,updated_at=now()
  returning hit_count into current_hits;

  if current_hits > p_limit then
    raise exception 'Too many requests. Please wait before trying again.';
  end if;
end;
$$;

revoke all on function public.consume_public_server_rate_limit(text,text,text,integer,integer)
  from public,anon,authenticated;
grant execute on function public.consume_public_server_rate_limit(text,text,text,integer,integer)
  to service_role;

revoke execute on function public.get_customer_booking(text,text) from anon,authenticated;
revoke execute on function public.attach_public_booking_identity(text,text,text,text,text,date) from anon,authenticated;
revoke execute on function public.cancel_customer_booking(text,text) from anon,authenticated;
revoke execute on function public.reschedule_customer_booking(text,text,timestamptz) from anon,authenticated;

comment on function public.consume_public_server_rate_limit(text,text,text,integer,integer) is
  'Service-only preflight limiter. Raw request signals are HMAC-derived and are never stored.';
