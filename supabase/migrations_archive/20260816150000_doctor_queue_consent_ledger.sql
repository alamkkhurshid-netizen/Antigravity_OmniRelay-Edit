create table public.doctor_queue_consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource_id uuid not null references public.booking_resources(id) on delete cascade,
  action text not null check (action in ('enabled','withdrawn')),
  notice_version text not null,
  notice_text text not null,
  channel text not null check (channel = 'whatsapp'),
  phone_identity text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now()
);

create index doctor_queue_consent_events_org_resource_idx
  on public.doctor_queue_consent_events (organization_id, resource_id, recorded_at desc);

alter table public.doctor_queue_consent_events enable row level security;
revoke all on public.doctor_queue_consent_events from public, anon, authenticated;
grant select on public.doctor_queue_consent_events to authenticated;

create policy "admins read doctor queue consent evidence"
on public.doctor_queue_consent_events for select to authenticated
using (private.is_organization_member(organization_id, 'admin'));

create or replace function public.set_doctor_queue_consent(
  p_organization_id uuid,
  p_resource_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  profile_row public.provider_profiles%rowtype;
  normalized_phone text;
  notice_version constant text := 'doctor_queue_v1';
  notice_text constant text := 'The doctor agreed to receive operational shift and booking-count notifications on the listed WhatsApp number. Messages exclude patient names and clinical information. Consent can be withdrawn at any time.';
begin
  if actor_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into profile_row
  from public.provider_profiles
  where organization_id = p_organization_id and resource_id = p_resource_id
  for update;
  if not found then raise exception 'Doctor profile not found' using errcode = 'P0002'; end if;

  normalized_phone := private.normalize_phone_identity(profile_row.contact_phone);
  if p_enabled and normalized_phone is null then
    raise exception 'A valid doctor WhatsApp number is required';
  end if;

  update public.provider_profiles
  set queue_notifications_enabled = p_enabled,
      whatsapp_queue_consent_at = case when p_enabled then now() else null end,
      whatsapp_queue_consent_notice_version = case when p_enabled then notice_version else null end,
      whatsapp_queue_consent_recorded_by = actor_id,
      updated_at = now()
  where organization_id = p_organization_id and resource_id = p_resource_id;

  insert into public.doctor_queue_consent_events (
    organization_id, resource_id, action, notice_version, notice_text,
    channel, phone_identity, recorded_by
  ) values (
    p_organization_id, p_resource_id,
    case when p_enabled then 'enabled' else 'withdrawn' end,
    notice_version, notice_text, 'whatsapp', normalized_phone, actor_id
  );

  return jsonb_build_object(
    'resource_id', p_resource_id,
    'enabled', p_enabled,
    'consent_recorded_at', case when p_enabled then now() else null end,
    'notice_version', notice_version
  );
end;
$function$;

revoke all on function public.set_doctor_queue_consent(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_doctor_queue_consent(uuid, uuid, boolean) to authenticated;

