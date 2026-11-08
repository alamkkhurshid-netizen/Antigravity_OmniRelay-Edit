-- Rate-limit public booking reads and manage-token actions without storing raw
-- IP addresses, booking references, slugs, phone numbers, or tokens.

create or replace function private.consume_public_request_limit(
  p_bucket text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  caller_role text;
  client_signal text;
  pepper text;
  digest_hex text;
  actor_id uuid;
  window_start timestamptz;
  current_hits integer;
begin
  caller_role := claims ->> 'role';

  -- Direct trusted database work and service-role workers are not public
  -- requests. Public PostgREST calls carry anon/authenticated JWT claims.
  if caller_role is null or caller_role = 'service_role' then
    return;
  end if;

  if p_bucket not in (
      'public_booking_page',
      'public_booking_slots',
      'public_booking_manage_lookup',
      'public_booking_identity',
      'public_booking_cancel',
      'public_booking_reschedule'
    )
    or p_limit < 1 or p_limit > 500
    or p_window_seconds < 60 or p_window_seconds > 3600
    or nullif(trim(coalesce(p_scope, '')), '') is null then
    raise exception 'Invalid public request limit';
  end if;

  client_signal := coalesce(
    nullif(headers ->> 'cf-connecting-ip', ''),
    nullif(headers ->> 'x-real-ip', ''),
    nullif(split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1), ''),
    'unavailable'
  );

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  if nullif(pepper, '') is null then
    raise exception 'Public request protection is temporarily unavailable';
  end if;

  digest_hex := encode(
    extensions.hmac(
      p_bucket || '|' || lower(trim(p_scope)) || '|' || trim(client_signal),
      pepper,
      'sha256'
    ),
    'hex'
  );
  actor_id := (
    substr(digest_hex, 1, 8) || '-' ||
    substr(digest_hex, 9, 4) || '-' ||
    substr(digest_hex, 13, 4) || '-' ||
    substr(digest_hex, 17, 4) || '-' ||
    substr(digest_hex, 21, 12)
  )::uuid;
  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.api_rate_limits(actor_user_id, bucket, window_started_at)
  values(actor_id, p_bucket, window_start)
  on conflict(actor_user_id, bucket, window_started_at)
  do update set hit_count = private.api_rate_limits.hit_count + 1, updated_at = now()
  returning hit_count into current_hits;

  if current_hits > p_limit then
    raise exception 'Too many requests. Please wait before trying again.';
  end if;
end;
$$;

revoke all on function private.consume_public_request_limit(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function private.consume_public_request_limit(text,text,integer,integer)
  to service_role;

-- Keep the reviewed implementations private and expose thin, rate-limited
-- wrappers under their existing RPC names and signatures.
alter function public.get_public_booking_page(text) rename to get_public_booking_page_core;
alter function public.get_public_booking_page_core(text) set schema private;
alter function public.get_public_booking_slots(text,uuid,uuid,uuid,date) rename to get_public_booking_slots_core;
alter function public.get_public_booking_slots_core(text,uuid,uuid,uuid,date) set schema private;
alter function public.get_customer_booking(text,text) rename to get_customer_booking_core;
alter function public.get_customer_booking_core(text,text) set schema private;
alter function public.attach_public_booking_identity(text,text,text,text,text,date) rename to attach_public_booking_identity_core;
alter function public.attach_public_booking_identity_core(text,text,text,text,text,date) set schema private;
alter function public.cancel_customer_booking(text,text) rename to cancel_customer_booking_core;
alter function public.cancel_customer_booking_core(text,text) set schema private;
alter function public.reschedule_customer_booking(text,text,timestamptz) rename to reschedule_customer_booking_core;
alter function public.reschedule_customer_booking_core(text,text,timestamptz) set schema private;

revoke all on function private.get_public_booking_page_core(text) from public, anon, authenticated;
revoke all on function private.get_public_booking_slots_core(text,uuid,uuid,uuid,date) from public, anon, authenticated;
revoke all on function private.get_customer_booking_core(text,text) from public, anon, authenticated;
revoke all on function private.attach_public_booking_identity_core(text,text,text,text,text,date) from public, anon, authenticated;
revoke all on function private.cancel_customer_booking_core(text,text) from public, anon, authenticated;
revoke all on function private.reschedule_customer_booking_core(text,text,timestamptz) from public, anon, authenticated;

create function public.get_public_booking_page(p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.consume_public_request_limit('public_booking_page',p_slug,90,60);
  return private.get_public_booking_page_core(p_slug);
end; $$;

create function public.get_public_booking_slots(
  p_slug text,p_service_id uuid,p_location_id uuid,p_resource_id uuid,p_date date
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.consume_public_request_limit('public_booking_slots',p_slug,180,60);
  return private.get_public_booking_slots_core(p_slug,p_service_id,p_location_id,p_resource_id,p_date);
end; $$;

create function public.get_customer_booking(p_booking_reference text,p_manage_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.consume_public_request_limit('public_booking_manage_lookup',p_booking_reference,20,600);
  return private.get_customer_booking_core(p_booking_reference,p_manage_token);
end; $$;

create function public.attach_public_booking_identity(
  p_booking_reference text,p_manage_token text,p_booking_contact_name text,
  p_booking_contact_phone text,p_patient_relationship text,p_patient_date_of_birth date default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.consume_public_request_limit('public_booking_identity',p_booking_reference,10,600);
  perform private.attach_public_booking_identity_core(
    p_booking_reference,p_manage_token,p_booking_contact_name,p_booking_contact_phone,
    p_patient_relationship,p_patient_date_of_birth
  );
end; $$;

create function public.cancel_customer_booking(p_booking_reference text,p_manage_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.consume_public_request_limit('public_booking_cancel',p_booking_reference,10,600);
  perform private.cancel_customer_booking_core(p_booking_reference,p_manage_token);
end; $$;

create function public.reschedule_customer_booking(
  p_booking_reference text,p_manage_token text,p_starts_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.consume_public_request_limit('public_booking_reschedule',p_booking_reference,20,600);
  perform private.reschedule_customer_booking_core(p_booking_reference,p_manage_token,p_starts_at);
end; $$;

revoke all on function public.get_public_booking_page(text) from public;
revoke all on function public.get_public_booking_slots(text,uuid,uuid,uuid,date) from public;
revoke all on function public.get_customer_booking(text,text) from public;
revoke all on function public.attach_public_booking_identity(text,text,text,text,text,date) from public;
revoke all on function public.cancel_customer_booking(text,text) from public;
revoke all on function public.reschedule_customer_booking(text,text,timestamptz) from public;

grant execute on function public.get_public_booking_page(text) to anon,authenticated,service_role;
grant execute on function public.get_public_booking_slots(text,uuid,uuid,uuid,date) to anon,authenticated,service_role;
grant execute on function public.get_customer_booking(text,text) to anon,authenticated,service_role;
grant execute on function public.attach_public_booking_identity(text,text,text,text,text,date) to anon,authenticated,service_role;
grant execute on function public.cancel_customer_booking(text,text) to anon,authenticated,service_role;
grant execute on function public.reschedule_customer_booking(text,text,timestamptz) to anon,authenticated,service_role;

comment on function private.consume_public_request_limit(text,text,integer,integer) is
  'Pseudonymous rate limiter for public booking reads and manage-token actions; stores HMAC-derived identifiers only.';
