-- Migration: 20261027200000_whatsapp_registration_vault_and_status.sql
-- Description:
-- 1. Add 'pending_registration' to channel_connections_status_check constraint.
-- 2. Move WhatsApp Meta access tokens to Supabase Vault (server-only encrypted storage).
-- 3. Update sync_whatsapp_signup RPC to store tokens in Vault and strip from organizations_addresses.extra.
-- 4. Provide service-role-only helper functions public.store_whatsapp_access_token and public.get_whatsapp_access_token.

-- 1. Update channel_connections_status_check constraint
alter table public.channel_connections
  drop constraint if exists channel_connections_status_check;

alter table public.channel_connections
  add constraint channel_connections_status_check
  check (status in ('not_connected', 'pending', 'pending_registration', 'test', 'live', 'error', 'disabled'));

-- 2. Create helper functions for Vault-backed token storage
create or replace function public.store_whatsapp_access_token(
  p_organization_id uuid,
  p_phone_number_id text,
  p_access_token text
) returns uuid as $$
declare
  v_secret_name text;
  v_secret_id uuid;
begin
  if p_access_token is null or length(trim(p_access_token)) = 0 then
    return null;
  end if;

  v_secret_name := 'whatsapp_access_token:' || p_organization_id::text || ':' || p_phone_number_id;

  select id into v_secret_id
  from vault.secrets
  where name = v_secret_name
  limit 1;

  if v_secret_id is not null then
    perform vault.update_secret(
      secret_id := v_secret_id,
      new_secret := p_access_token,
      new_name := v_secret_name,
      new_description := 'WhatsApp Cloud API access token for org ' || p_organization_id::text || ' phone ' || p_phone_number_id
    );
  else
    v_secret_id := vault.create_secret(
      new_secret := p_access_token,
      new_name := v_secret_name,
      new_description := 'WhatsApp Cloud API access token for org ' || p_organization_id::text || ' phone ' || p_phone_number_id
    );
  end if;

  return v_secret_id;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.get_whatsapp_access_token(
  p_organization_id uuid,
  p_phone_number_id text
) returns text as $$
declare
  v_secret_name text;
  v_token text;
begin
  v_secret_name := 'whatsapp_access_token:' || p_organization_id::text || ':' || p_phone_number_id;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = v_secret_name
  limit 1;

  return v_token;
end;
$$ language plpgsql security definer set search_path = '';

-- Strictly revoke access from public, anon, and authenticated. Grant only to service_role.
revoke all on function public.store_whatsapp_access_token(uuid, text, text) from public, anon, authenticated;
grant execute on function public.store_whatsapp_access_token(uuid, text, text) to service_role;

revoke all on function public.get_whatsapp_access_token(uuid, text) from public, anon, authenticated;
grant execute on function public.get_whatsapp_access_token(uuid, text) to service_role;

-- 3. Migrate existing access tokens in organizations_addresses to Vault
do $$
declare
  r record;
  v_secret_name text;
  v_secret_id uuid;
begin
  for r in (
    select organization_id, address, extra->>'access_token' as tok
    from public.organizations_addresses
    where service = 'whatsapp'
      and extra ? 'access_token'
      and extra->>'access_token' is not null
      and length(extra->>'access_token') > 0
  ) loop
    v_secret_name := 'whatsapp_access_token:' || r.organization_id::text || ':' || r.address;

    select id into v_secret_id
    from vault.secrets
    where name = v_secret_name
    limit 1;

    if v_secret_id is not null then
      perform vault.update_secret(
        secret_id := v_secret_id,
        new_secret := r.tok,
        new_name := v_secret_name,
        new_description := 'WhatsApp Cloud API access token for org ' || r.organization_id::text || ' phone ' || r.address
      );
    else
      perform vault.create_secret(
        new_secret := r.tok,
        new_name := v_secret_name,
        new_description := 'WhatsApp Cloud API access token for org ' || r.organization_id::text || ' phone ' || r.address
      );
    end if;
  end loop;

  -- Remove access_token from extra across all organizations_addresses (temporarily bypass set_extra merge trigger)
  alter table public.organizations_addresses disable trigger set_extra;
  update public.organizations_addresses
  set extra = extra - 'access_token'
  where service = 'whatsapp' and extra ? 'access_token';
  alter table public.organizations_addresses enable trigger set_extra;
end;
$$;

-- 4. Update sync_whatsapp_signup to store access_token in Vault and NOT in organizations_addresses.extra
create or replace function public.sync_whatsapp_signup(
  p_organization_id uuid,
  p_phone_number_id text,
  p_waba_id text,
  p_display_phone_number text,
  p_verified_name text,
  p_flow_type text,
  p_access_token text,
  p_business_id text default null,
  p_code_verification_status text default null,
  p_quality_rating text default null
) returns jsonb as $$
declare
  v_connection_id uuid;
  v_status text;
  v_cloud_api_registered_at timestamptz := null;
begin
  -- Validate organization exists
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'Organization % not found', p_organization_id
      using errcode = '23503';
  end if;

  -- Verify cross-tenant check before mutating
  if exists (
    select 1 from public.channel_connections
    where channel = 'whatsapp'
      and external_phone_number_id = p_phone_number_id
      and organization_id <> p_organization_id
  ) or exists (
    select 1 from public.organizations_addresses
    where service = 'whatsapp'
      and address = p_phone_number_id
      and organization_id <> p_organization_id
  ) then
    raise exception 'Cross-tenant phone assignment rejected: phone % belongs to another tenant', p_phone_number_id
      using errcode = '23505';
  end if;

  -- Determine lifecycle status and cloud registration timestamp
  if p_flow_type = 'existing_phone_number' then
    v_status := 'test';
  elsif p_flow_type = 'new_phone_number' and upper(coalesce(p_code_verification_status, '')) = 'VERIFIED' then
    v_status := 'test';
    v_cloud_api_registered_at := clock_timestamp();
  else
    v_status := 'pending_registration';
  end if;

  -- Store token securely in Vault (server-only encrypted storage)
  if p_access_token is not null and length(trim(p_access_token)) > 0 then
    perform public.store_whatsapp_access_token(p_organization_id, p_phone_number_id, p_access_token);
  end if;

  -- 1. Upsert organizations_addresses (WITHOUT access_token in extra)
  insert into public.organizations_addresses (
    organization_id,
    address,
    service,
    status,
    extra
  ) values (
    p_organization_id,
    p_phone_number_id,
    'whatsapp',
    'connected',
    jsonb_build_object(
      'waba_id', p_waba_id,
      'business_id', p_business_id,
      'phone_number', p_display_phone_number,
      'verified_name', p_verified_name,
      'flow_type', p_flow_type,
      'code_verification_status', p_code_verification_status,
      'quality_rating', p_quality_rating,
      'cloud_api_registered_at', v_cloud_api_registered_at
    )
  )
  on conflict (organization_id, address) do update set
    status = 'connected',
    extra = (excluded.extra - 'access_token'),
    updated_at = now();

  -- 2. Upsert channel_connections (lifecycle, UI status, and routing)
  insert into public.channel_connections (
    organization_id,
    channel,
    provider,
    status,
    external_account_id,
    external_phone_number_id,
    display_name,
    display_address,
    capabilities,
    last_verified_at,
    updated_at
  ) values (
    p_organization_id,
    'whatsapp',
    'meta_cloud',
    v_status,
    p_waba_id,
    p_phone_number_id,
    p_verified_name,
    p_display_phone_number,
    jsonb_build_object(
      'flow_type', p_flow_type,
      'waba_id', p_waba_id,
      'quality_rating', p_quality_rating,
      'code_verification_status', p_code_verification_status
    ),
    now(),
    now()
  )
  on conflict (organization_id, channel, provider) do update set
    status = excluded.status,
    external_account_id = excluded.external_account_id,
    external_phone_number_id = excluded.external_phone_number_id,
    display_name = excluded.display_name,
    display_address = excluded.display_address,
    capabilities = excluded.capabilities,
    last_verified_at = now(),
    last_error = null,
    updated_at = now()
  returning id into v_connection_id;

  -- 3. Write immutable operational audit event
  insert into public.audit_logs (
    organization_id,
    action,
    details
  ) values (
    p_organization_id,
    'CHANNEL_CONNECTION_LINKED',
    jsonb_build_object(
      'channel', 'whatsapp',
      'provider', 'meta_cloud',
      'phone_number_id', p_phone_number_id,
      'waba_id', p_waba_id,
      'flow_type', p_flow_type,
      'status', v_status,
      'connection_id', v_connection_id
    )
  );

  -- 4. Return sanitized response (NO access_token, NO verify_token)
  return jsonb_build_object(
    'success', true,
    'connection_id', v_connection_id,
    'organization_id', p_organization_id,
    'phone_number_id', p_phone_number_id,
    'status', v_status,
    'display_address', p_display_phone_number,
    'display_name', p_verified_name
  );
end;
$$ language plpgsql security definer set search_path = '';

-- Revoke from public, anon, authenticated; grant only to service_role
revoke all on function public.sync_whatsapp_signup(uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.sync_whatsapp_signup(uuid, text, text, text, text, text, text, text, text, text) to service_role;
