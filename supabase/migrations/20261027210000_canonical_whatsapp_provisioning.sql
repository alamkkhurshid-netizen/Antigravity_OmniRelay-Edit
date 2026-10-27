-- Migration: 20261027210000_canonical_whatsapp_provisioning.sql
-- Description:
-- 1. Add canonical lifecycle states to channel_connections_status_check constraint:
--    initiated, authorized, assets_verified, webhook_subscribed, pending_registration,
--    pending_verification, connected, acceptance_testing, live, failed_recoverable, disabled.
-- 2. Create whatsapp_onboarding_runs table with strict audit properties (no tokens/PINs).
-- 3. Create private.whatsapp_credentials table with server-only encryption, key versioning, and zero Data API access.
-- 4. Update store_whatsapp_access_token and get_whatsapp_access_token RPCs.
-- 5. Update ingest_inbound_whatsapp_message to route for connected/acceptance_testing statuses.
-- 6. Reconcile existing connection for 1425585367294509 to pending_registration.

-- ============================================================================
-- 1. Canonical Lifecycle States on channel_connections
-- ============================================================================

alter table public.channel_connections
  drop constraint if exists channel_connections_status_check;

alter table public.channel_connections
  add constraint channel_connections_status_check
  check (status in (
    'initiated',
    'authorized',
    'assets_verified',
    'webhook_subscribed',
    'pending_registration',
    'pending_verification',
    'connected',
    'acceptance_testing',
    'live',
    'failed_recoverable',
    'disabled',
    'not_connected',
    'pending',
    'test',
    'error'
  ));

-- ============================================================================
-- 2. whatsapp_onboarding_runs Table
-- ============================================================================

create table if not exists public.whatsapp_onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  flow_type text not null check (flow_type in ('new_phone_number', 'existing_phone_number', 'only_waba')),
  waba_id text not null,
  phone_number_id text,
  status text not null check (status in (
    'initiated',
    'authorized',
    'assets_verified',
    'webhook_subscribed',
    'pending_registration',
    'pending_verification',
    'connected',
    'acceptance_testing',
    'live',
    'failed_recoverable',
    'disabled'
  )),
  attempt_count integer not null default 1,
  trace_id text,
  sanitized_error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_onboarding_runs_org_idx
  on public.whatsapp_onboarding_runs (organization_id, created_at desc);

create index if not exists whatsapp_onboarding_runs_phone_idx
  on public.whatsapp_onboarding_runs (phone_number_id)
  where phone_number_id is not null;

alter table public.whatsapp_onboarding_runs enable row level security;

-- Tenant users can view their runs, but cannot insert/update/delete directly
drop policy if exists "Tenant users can view their whatsapp onboarding runs" on public.whatsapp_onboarding_runs;
create policy "Tenant users can view their whatsapp onboarding runs"
  on public.whatsapp_onboarding_runs for select
  to authenticated
  using (organization_id in (
    select organization_id from public.agents where user_id = auth.uid()
  ));

revoke all on public.whatsapp_onboarding_runs from anon;
revoke insert, update, delete on public.whatsapp_onboarding_runs from authenticated;
grant all on public.whatsapp_onboarding_runs to service_role;

-- ============================================================================
-- 3. Private Encrypted Credential Table
-- ============================================================================

create table if not exists private.whatsapp_credentials (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_number_id text not null,
  waba_id text not null,
  encrypted_token text not null,
  key_version text not null default 'v1',
  algorithm text not null default 'pgsodium-det-aead',
  vault_secret_id uuid references vault.secrets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, phone_number_id)
);

revoke all on table private.whatsapp_credentials from public, anon, authenticated;
grant all on table private.whatsapp_credentials to service_role;

-- ============================================================================
-- 4. Server-Only Token Management RPCs (Fail-Closed Encryption)
-- ============================================================================

create or replace function public.store_whatsapp_access_token(
  p_organization_id uuid,
  p_phone_number_id text,
  p_access_token text,
  p_waba_id text default ''
) returns uuid as $$
declare
  v_secret_name text;
  v_secret_id uuid;
  v_encrypted_val text;
begin
  if p_access_token is null or length(trim(p_access_token)) = 0 then
    raise exception 'Cannot store empty access token' using errcode = '22000';
  end if;

  v_secret_name := 'whatsapp_access_token:' || p_organization_id::text || ':' || p_phone_number_id;

  -- 1. Store/Update in Supabase Vault (fails closed if Vault fails)
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

  if v_secret_id is null then
    raise exception 'Vault encryption failed: could not create or update secret' using errcode = 'XX000';
  end if;

  -- 2. Store in private.whatsapp_credentials referencing the vault secret
  select secret into v_encrypted_val from vault.secrets where id = v_secret_id;

  insert into private.whatsapp_credentials (
    organization_id,
    phone_number_id,
    waba_id,
    encrypted_token,
    key_version,
    algorithm,
    vault_secret_id,
    updated_at
  ) values (
    p_organization_id,
    p_phone_number_id,
    coalesce(nullif(p_waba_id, ''), 'unknown'),
    coalesce(v_encrypted_val, 'encrypted'),
    'v1',
    'pgsodium-det-aead',
    v_secret_id,
    now()
  )
  on conflict (organization_id, phone_number_id) do update set
    waba_id = case when excluded.waba_id <> 'unknown' then excluded.waba_id else private.whatsapp_credentials.waba_id end,
    encrypted_token = excluded.encrypted_token,
    vault_secret_id = excluded.vault_secret_id,
    updated_at = now();

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

revoke all on function public.store_whatsapp_access_token(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.store_whatsapp_access_token(uuid, text, text, text) to service_role;

revoke all on function public.get_whatsapp_access_token(uuid, text) from public, anon, authenticated;
grant execute on function public.get_whatsapp_access_token(uuid, text) to service_role;

-- ============================================================================
-- 5. Update ingest_inbound_whatsapp_message to route connected & acceptance_testing
-- ============================================================================

create or replace function public.ingest_inbound_whatsapp_message(
  p_phone_number_id text,
  p_waba_id text,
  p_provider_message_id text,
  p_sender_phone text,
  p_sender_name text default null,
  p_content jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
) returns jsonb as $$
declare
  v_org_id uuid;
  v_message_id uuid;
  v_inserted boolean := false;
  v_normalized_content jsonb;
begin
  -- Normalize message content to satisfy messages_content_schema check constraint
  v_normalized_content := case
    when p_content is null or p_content = '{}'::jsonb then '{}'::jsonb
    else jsonb_build_object(
      'version', coalesce(p_content->>'version', '1'),
      'type', coalesce(p_content->>'type', 'text'),
      'kind', coalesce(p_content->>'kind', coalesce(p_content->>'type', 'text')),
      'text', coalesce(p_content->>'text', p_content#>>'{text,body}', '')
    ) || p_content
  end;

  -- 1. Validate organization and recipient routing via channel_connections (primary)
  select organization_id into v_org_id
  from public.channel_connections
  where channel = 'whatsapp'
    and external_phone_number_id = p_phone_number_id
    and status in ('live', 'connected', 'acceptance_testing', 'test', 'pending')
  limit 1;

  -- Safe fallback to organizations_addresses for legacy records
  if v_org_id is null then
    select organization_id into v_org_id
    from public.organizations_addresses
    where service = 'whatsapp'
      and address = p_phone_number_id
      and status = 'connected'
    limit 1;
  end if;

  -- If unmapped recipient, record durable operational event and return safely
  if v_org_id is null then
    insert into public.operational_events (
      organization_id,
      event_source,
      severity,
      error_code,
      safe_message,
      metadata
    ) values (
      null,
      'whatsapp_inbound',
      'warning',
      'ROUTING_UNMAPPED_RECIPIENT',
      'Inbound WhatsApp message received for unmapped recipient phone_number_id.',
      jsonb_build_object(
        'phone_number_id', p_phone_number_id,
        'waba_id', p_waba_id,
        'provider_message_id', p_provider_message_id
      )
    );
    return jsonb_build_object(
      'success', false,
      'reason', 'unmapped_recipient',
      'inserted', false
    );
  end if;

  -- 2. Check deduplication on messages table
  if exists (
    select 1 from public.messages where external_id = p_provider_message_id
  ) then
    return jsonb_build_object(
      'success', true,
      'reason', 'duplicate',
      'inserted', false,
      'organization_id', v_org_id
    );
  end if;

  -- 3. Upsert contact address
  if p_sender_phone is not null and p_sender_phone <> '' then
    insert into public.contacts_addresses (
      organization_id,
      address,
      service,
      extra
    ) values (
      v_org_id,
      p_sender_phone,
      'whatsapp',
      jsonb_build_object(
        'name', p_sender_name,
        'phone_number', p_sender_phone,
        'address_type', 'phone'
      )
    )
    on conflict (organization_id, address, service) do update set
      extra = coalesce(public.contacts_addresses.extra, '{}'::jsonb) || excluded.extra,
      updated_at = now();
  end if;

  -- 4. Record provider_message_id in webhook_events idempotency ledger
  insert into public.webhook_events (
    event_id,
    provider,
    organization_id,
    processed_at
  ) values (
    p_provider_message_id,
    'meta',
    v_org_id,
    now()
  )
  on conflict (event_id) do nothing;

  -- 5. Insert canonical incoming messages row
  insert into public.messages (
    organization_id,
    organization_address,
    contact_address,
    service,
    direction,
    external_id,
    content,
    status,
    timestamp
  ) values (
    v_org_id,
    p_phone_number_id,
    p_sender_phone,
    'whatsapp',
    'incoming',
    p_provider_message_id,
    v_normalized_content,
    jsonb_build_object('received', p_occurred_at),
    p_occurred_at
  )
  on conflict (external_id) do nothing
  returning id into v_message_id;

  if v_message_id is not null then
    v_inserted := true;
  end if;

  return jsonb_build_object(
    'success', true,
    'inserted', v_inserted,
    'message_id', v_message_id,
    'organization_id', v_org_id
  );
end;
$$ language plpgsql security definer set search_path = '';

revoke all on function public.ingest_inbound_whatsapp_message(text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_inbound_whatsapp_message(text, text, text, text, text, jsonb, timestamptz) to service_role;

-- ============================================================================
-- 5b. Update sync_whatsapp_signup to use canonical lifecycle states
-- ============================================================================

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

  -- Determine lifecycle status: new numbers stay pending_registration until PIN registration
  if p_flow_type = 'existing_phone_number' then
    if upper(coalesce(p_code_verification_status, '')) = 'VERIFIED' then
      v_status := 'connected';
    else
      v_status := 'pending_verification';
    end if;
  else
    v_status := 'pending_registration';
  end if;

  -- Store token securely in Vault and private.whatsapp_credentials
  if p_access_token is not null and length(trim(p_access_token)) > 0 then
    perform public.store_whatsapp_access_token(p_organization_id, p_phone_number_id, p_access_token, p_waba_id);
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

revoke all on function public.sync_whatsapp_signup(uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.sync_whatsapp_signup(uuid, text, text, text, text, text, text, text, text, text) to service_role;


-- ============================================================================
-- 6. Migrate existing staging token into private.whatsapp_credentials
-- ============================================================================

do $$
declare
  r record;
  v_secret_name text;
  v_token text;
begin
  for r in (
    select id, organization_id, external_account_id as waba_id, external_phone_number_id as phone_id
    from public.channel_connections
    where channel = 'whatsapp' and external_phone_number_id is not null
  ) loop
    v_secret_name := 'whatsapp_access_token:' || r.organization_id::text || ':' || r.phone_id;
    select decrypted_secret into v_token from vault.decrypted_secrets where name = v_secret_name limit 1;
    
    if v_token is not null then
      perform public.store_whatsapp_access_token(r.organization_id, r.phone_id, v_token, r.waba_id);
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- 7. Reconcile staging connection to pending_registration
-- ============================================================================

update public.channel_connections
set status = 'pending_registration',
    updated_at = now()
where channel = 'whatsapp'
  and external_phone_number_id = '1425585367294509';
