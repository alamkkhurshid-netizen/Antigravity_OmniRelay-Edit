alter table public.patient_profiles
  add column if not exists normalized_phone text
  generated always as (
    nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')
  ) stored;

create index if not exists patient_profiles_org_normalized_phone_idx
  on public.patient_profiles (organization_id, normalized_phone)
  where normalized_phone is not null;

create table public.patient_consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  consent_type text not null check (consent_type in ('care_communications', 'marketing')),
  previous_status boolean,
  new_status boolean not null,
  source text not null default 'patient_profile',
  captured_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  note text,
  metadata jsonb not null default '{}'::jsonb
);

create index patient_consent_events_patient_time_idx
  on public.patient_consent_events (organization_id, patient_id, captured_at desc);

alter table public.patient_consent_events enable row level security;

grant select, insert on public.patient_consent_events to authenticated;

create policy "members read patient consent history"
on public.patient_consent_events for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins record patient consent history"
on public.patient_consent_events for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and captured_by = auth.uid()
);

insert into public.patient_consent_events (
  organization_id, patient_id, consent_type, previous_status, new_status,
  source, captured_by, captured_at, note
)
select organization_id, id, 'care_communications', null::boolean,
  care_communications_consent, 'legacy_profile_import', null::uuid, created_at,
  'Initial state imported when the immutable consent ledger was enabled.'
from public.patient_profiles
union all
select organization_id, id, 'marketing', null::boolean,
  marketing_consent, 'legacy_profile_import', null::uuid, created_at,
  'Initial state imported when the immutable consent ledger was enabled.'
from public.patient_profiles;

create or replace function public.set_patient_consents(
  p_patient_id uuid,
  p_care_communications boolean,
  p_marketing boolean,
  p_source text default 'patient_profile',
  p_note text default null
) returns public.patient_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_patient public.patient_profiles%rowtype;
  updated_patient public.patient_profiles%rowtype;
  event_source text := coalesce(nullif(trim(p_source), ''), 'patient_profile');
begin
  select * into current_patient
  from public.patient_profiles
  where id = p_patient_id
  for update;

  if current_patient.id is null then
    raise exception 'Patient not found';
  end if;

  update public.patient_profiles
  set care_communications_consent = p_care_communications,
      marketing_consent = p_marketing,
      updated_at = now()
  where id = p_patient_id
  returning * into updated_patient;

  if current_patient.care_communications_consent is distinct from p_care_communications then
    insert into public.patient_consent_events (
      organization_id, patient_id, consent_type, previous_status, new_status,
      source, captured_by, note
    ) values (
      current_patient.organization_id, current_patient.id, 'care_communications',
      current_patient.care_communications_consent, p_care_communications,
      event_source, auth.uid(), nullif(trim(p_note), '')
    );
  end if;

  if current_patient.marketing_consent is distinct from p_marketing then
    insert into public.patient_consent_events (
      organization_id, patient_id, consent_type, previous_status, new_status,
      source, captured_by, note
    ) values (
      current_patient.organization_id, current_patient.id, 'marketing',
      current_patient.marketing_consent, p_marketing,
      event_source, auth.uid(), nullif(trim(p_note), '')
    );
  end if;

  return updated_patient;
end;
$$;

revoke all on function public.set_patient_consents(uuid, boolean, boolean, text, text)
from public, anon;
grant execute on function public.set_patient_consents(uuid, boolean, boolean, text, text)
to authenticated;
