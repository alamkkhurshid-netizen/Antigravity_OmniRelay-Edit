-- Restore clinic-care WhatsApp communication only when the verified channel
-- owner explicitly sends START. Marketing remains independently opted out.

create table if not exists public.whatsapp_preference_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid references public.patient_profiles(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  session_id uuid not null references public.whatsapp_booking_sessions(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete restrict,
  action text not null check (action in ('start')),
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  identity_hash bytea not null,
  identity_last4 text not null check (char_length(identity_last4) = 4),
  care_communications_enabled boolean not null,
  marketing_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, source_message_id, action)
);

create index if not exists whatsapp_preference_events_org_time_idx
  on public.whatsapp_preference_events (organization_id, created_at desc);

alter table public.whatsapp_preference_events enable row level security;

grant select on public.whatsapp_preference_events to authenticated;

create policy "members read WhatsApp preference events"
on public.whatsapp_preference_events for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create or replace function public.restore_whatsapp_care_consent(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_session_id uuid,
  p_source_message_id uuid,
  p_channel_identity text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized text;
  matched_patient uuid;
  pepper text;
  identity_digest bytea;
begin
  if coalesce((select auth.jwt()->>'role'), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  normalized := private.normalize_phone_identity(p_channel_identity);
  if normalized is null or length(normalized) < 4 then
    raise exception 'Invalid WhatsApp identity';
  end if;

  if not exists (
    select 1 from public.messages m
    where m.id = p_source_message_id
      and m.organization_id = p_organization_id
      and m.conversation_id = p_conversation_id
      and m.direction = 'incoming'
      and m.service = 'whatsapp'
      and lower(trim(coalesce(m.content->>'text', ''))) = 'start'
      and private.normalize_phone_identity(m.contact_address) = normalized
  ) then
    raise exception 'START must come from the verified WhatsApp conversation';
  end if;

  if not exists (
    select 1 from public.whatsapp_booking_sessions s
    where s.id = p_session_id
      and s.organization_id = p_organization_id
      and s.conversation_id = p_conversation_id
  ) then
    raise exception 'Booking session mismatch';
  end if;

  perform public.record_whatsapp_identity_verification(
    p_organization_id,
    p_conversation_id,
    p_session_id,
    p_source_message_id,
    p_channel_identity
  );

  delete from public.communication_opt_outs
  where organization_id = p_organization_id
    and channel = 'whatsapp'
    and address = normalized
    and scope in ('all', 'care');

  insert into public.communication_opt_outs (
    organization_id, channel, address, scope, source, reason
  ) values (
    p_organization_id, 'whatsapp', normalized, 'marketing',
    'whatsapp_start', 'Marketing remains opted out after START'
  )
  on conflict (organization_id, channel, address, scope)
  do update set
    opted_out_at = now(),
    source = excluded.source,
    reason = excluded.reason;

  select p.id into matched_patient
  from public.patient_profiles p
  where p.organization_id = p_organization_id
    and p.normalized_phone = normalized
  limit 1;

  if matched_patient is not null then
    perform set_config('omnirelay.consent_source', 'whatsapp_start', true);
    perform set_config(
      'omnirelay.consent_note',
      'Patient sent START from the verified clinic WhatsApp conversation; marketing remains off.',
      true
    );
    update public.patient_profiles
    set care_communications_consent = true,
        marketing_consent = false,
        updated_at = now()
    where id = matched_patient;
  end if;

  select decrypted_secret into pepper
  from vault.decrypted_secrets
  where name = 'edge_functions_token'
  limit 1;
  identity_digest := extensions.hmac(
    p_organization_id::text || '|' || normalized,
    pepper,
    'sha256'
  );

  insert into public.whatsapp_preference_events (
    organization_id, patient_id, conversation_id, session_id,
    source_message_id, action, identity_hash, identity_last4,
    care_communications_enabled, marketing_enabled,
    metadata
  ) values (
    p_organization_id, matched_patient, p_conversation_id, p_session_id,
    p_source_message_id, 'start', identity_digest, right(normalized, 4),
    true, false,
    jsonb_build_object('verified_by', 'whatsapp_channel_possession')
  )
  on conflict (organization_id, source_message_id, action) do nothing;

  return jsonb_build_object(
    'restored', true,
    'patient_linked', matched_patient is not null,
    'marketing_enabled', false
  );
end;
$function$;

revoke all on function public.restore_whatsapp_care_consent(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.restore_whatsapp_care_consent(uuid, uuid, uuid, uuid, text)
to service_role;

comment on table public.whatsapp_preference_events is
  'Append-only evidence for verified WhatsApp communication preference commands.';
comment on function public.restore_whatsapp_care_consent(uuid, uuid, uuid, uuid, text) is
  'Service-role-only START handler. Restores clinic-care messages, preserves marketing opt-out, and records channel-possession evidence.';
