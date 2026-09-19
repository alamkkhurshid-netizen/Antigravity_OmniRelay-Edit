-- Bound anonymous/authenticated public booking mutations at the shared
-- appointment insert boundary. The identifier stored in the existing private
-- limiter table is an HMAC-derived UUID; raw phone numbers and email addresses
-- are never written to the limiter.

create index if not exists api_rate_limits_updated_at_idx
  on private.api_rate_limits (updated_at);

create or replace function private.enforce_public_booking_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claims jsonb;
  caller_role text;
  normalized_phone text;
  contact_identity text;
  pepper text;
  digest_hex text;
  contact_actor uuid;
  contact_window timestamptz;
  organization_window timestamptz;
  current_hits integer;
begin
  if new.source is distinct from 'web'
     or new.status not in ('confirmed', 'payment_pending') then
    return new;
  end if;

  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  caller_role := claims->>'role';

  -- Trusted Edge Functions and database-internal workflows already have their
  -- own authorization and retry controls. Public browser and API calls do not.
  if caller_role is null or caller_role = 'service_role' then
    return new;
  end if;

  normalized_phone := private.normalize_phone_identity(new.customer_phone);
  contact_identity := coalesce(
    nullif(normalized_phone, ''),
    nullif(lower(trim(coalesce(new.customer_email, ''))), '')
  );
  if contact_identity is null then
    raise exception 'A valid mobile number or email is required';
  end if;

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  if nullif(pepper, '') is null then
    raise exception 'Public booking protection is temporarily unavailable';
  end if;

  digest_hex := encode(
    extensions.hmac(
      new.organization_id::text || '|' || contact_identity,
      pepper,
      'sha256'
    ),
    'hex'
  );
  contact_actor := (
    substr(digest_hex, 1, 8) || '-' ||
    substr(digest_hex, 9, 4) || '-' ||
    substr(digest_hex, 13, 4) || '-' ||
    substr(digest_hex, 17, 4) || '-' ||
    substr(digest_hex, 21, 12)
  )::uuid;

  contact_window := date_trunc('hour', now());
  insert into private.api_rate_limits (
    actor_user_id, bucket, window_started_at
  ) values (
    contact_actor, 'public_booking_contact', contact_window
  )
  on conflict (actor_user_id, bucket, window_started_at)
  do update set
    hit_count = private.api_rate_limits.hit_count + 1,
    updated_at = now()
  returning hit_count into current_hits;

  if current_hits > 5 then
    raise exception 'Too many booking attempts. Please wait before trying again.';
  end if;

  organization_window := to_timestamp(
    floor(extract(epoch from now()) / 600) * 600
  );
  insert into private.api_rate_limits (
    actor_user_id, bucket, window_started_at
  ) values (
    new.organization_id, 'public_booking_organization', organization_window
  )
  on conflict (actor_user_id, bucket, window_started_at)
  do update set
    hit_count = private.api_rate_limits.hit_count + 1,
    updated_at = now()
  returning hit_count into current_hits;

  if current_hits > 60 then
    raise exception 'This booking page is receiving unusually high traffic. Please try again shortly.';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_public_booking_rate_limit()
  from public, anon, authenticated;
grant execute on function private.enforce_public_booking_rate_limit()
  to service_role;

drop trigger if exists "00_enforce_public_booking_rate_limit"
  on public.appointments;
create trigger "00_enforce_public_booking_rate_limit"
before insert on public.appointments
for each row execute function private.enforce_public_booking_rate_limit();

do $block$
declare existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'cleanup-api-rate-limits';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'cleanup-api-rate-limits',
    '17 3 * * *',
    $cron$delete from private.api_rate_limits
      where updated_at < now() - interval '7 days'$cron$
  );
end;
$block$;
