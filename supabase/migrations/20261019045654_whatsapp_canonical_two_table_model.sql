-- Migration: 20261019045654_whatsapp_canonical_two_table_model.sql
-- Description: Implement Two-Table WhatsApp Connection Model (organizations_addresses for sealed credentials,
--              channel_connections for lifecycle/routing) and Atomic Inbound Message Ingestion.

-- ============================================================================
-- 1. Partial Unique Index on channel_connections.external_phone_number_id
-- ============================================================================

create unique index if not exists channel_connections_whatsapp_phone_number_id_idx
  on public.channel_connections (external_phone_number_id)
  where channel = 'whatsapp' and external_phone_number_id is not null;

-- ============================================================================
-- 2. Reject Cross-Tenant Phone-Number Reassignment
-- ============================================================================

create or replace function private.prevent_cross_tenant_phone_reassignment()
returns trigger as $$
begin
  if new.channel = 'whatsapp' and new.external_phone_number_id is not null then
    -- Reject if external_phone_number_id is already bound to a different organization in channel_connections
    if exists (
      select 1 from public.channel_connections
      where channel = 'whatsapp'
        and external_phone_number_id = new.external_phone_number_id
        and organization_id <> new.organization_id
        and (new.id is null or id <> new.id)
    ) then
      raise exception 'Cross-tenant WhatsApp phone assignment rejected: phone_number_id % is already registered to another organization', new.external_phone_number_id
        using errcode = '23505';
    end if;

    -- Reject if external_phone_number_id is already bound to a different organization in organizations_addresses
    if exists (
      select 1 from public.organizations_addresses
      where service = 'whatsapp'
        and address = new.external_phone_number_id
        and organization_id <> new.organization_id
    ) then
      raise exception 'Cross-tenant WhatsApp phone assignment rejected: address % is already registered to another organization in organizations_addresses', new.external_phone_number_id
        using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists trg_prevent_cross_tenant_phone on public.channel_connections;
create trigger trg_prevent_cross_tenant_phone
  before insert or update of external_phone_number_id, organization_id
  on public.channel_connections
  for each row
  execute function private.prevent_cross_tenant_phone_reassignment();

-- ============================================================================
-- 3. Service-Role-Only Atomic Signup Synchronization RPC
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

  -- Determine lifecycle status and cloud registration timestamp
  -- Set successful verified/coexistence signup status to 'test', not 'live'.
  -- Only whatsapp-onboarding-reconciler may promote a connection to 'live'
  -- after one inbound and one delivered outbound message.
  if p_flow_type = 'existing_phone_number' then
    v_status := 'test';
  elsif p_flow_type = 'new_phone_number' and upper(coalesce(p_code_verification_status, '')) = 'VERIFIED' then
    v_status := 'test';
    v_cloud_api_registered_at := clock_timestamp();
  else
    v_status := 'pending';
  end if;

  -- 1. Upsert organizations_addresses (sealed provider credentials)
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
      'access_token', p_access_token,
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
    extra = excluded.extra,
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

-- ============================================================================
-- 4. Service-Role-Only Atomic Inbound Message Ingestion RPC
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
    and status in ('live', 'test', 'pending')
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
      null, -- Nullable platform-level audit event (no organization foreign key violation)
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
  -- Inserting direction='incoming' and service='whatsapp' natively invokes
  -- private.invoke_whatsapp_booking_concierge() via PostgreSQL trigger
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

-- Revoke from public, anon, authenticated; grant only to service_role
revoke all on function public.ingest_inbound_whatsapp_message(text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_inbound_whatsapp_message(text, text, text, text, text, jsonb, timestamptz) to service_role;
