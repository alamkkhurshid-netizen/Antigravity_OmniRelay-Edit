-- Capture patient consent changes regardless of which trusted workflow updates
-- the patient profile (staff UI, public booking, import, or automation).

create or replace function private.capture_patient_consent_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_source text := coalesce(
    nullif(current_setting('omnirelay.consent_source', true), ''),
    case
      when tg_op = 'INSERT' then 'patient_created:' || coalesce(new.source, 'unknown')
      else 'patient_profile_sync'
    end
  );
  event_note text := nullif(current_setting('omnirelay.consent_note', true), '');
begin
  if tg_op = 'INSERT' or old.care_communications_consent is distinct from new.care_communications_consent then
    insert into public.patient_consent_events (
      organization_id,
      patient_id,
      consent_type,
      previous_status,
      new_status,
      source,
      captured_by,
      note
    ) values (
      new.organization_id,
      new.id,
      'care_communications',
      case when tg_op = 'INSERT' then null else old.care_communications_consent end,
      new.care_communications_consent,
      event_source,
      auth.uid(),
      event_note
    );
  end if;

  if tg_op = 'INSERT' or old.marketing_consent is distinct from new.marketing_consent then
    insert into public.patient_consent_events (
      organization_id,
      patient_id,
      consent_type,
      previous_status,
      new_status,
      source,
      captured_by,
      note
    ) values (
      new.organization_id,
      new.id,
      'marketing',
      case when tg_op = 'INSERT' then null else old.marketing_consent end,
      new.marketing_consent,
      event_source,
      auth.uid(),
      event_note
    );
  end if;

  return new;
end;
$$;

revoke all on function private.capture_patient_consent_changes() from public;

drop trigger if exists patient_profiles_capture_consent on public.patient_profiles;
create trigger patient_profiles_capture_consent
after insert or update of care_communications_consent, marketing_consent
on public.patient_profiles
for each row
execute function private.capture_patient_consent_changes();

create or replace function public.set_patient_consents(
  p_patient_id uuid,
  p_care_communications boolean,
  p_marketing boolean,
  p_source text default 'staff_profile',
  p_note text default null
)
returns public.patient_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_patient public.patient_profiles;
begin
  perform set_config(
    'omnirelay.consent_source',
    coalesce(nullif(trim(p_source), ''), 'staff_profile'),
    true
  );
  perform set_config('omnirelay.consent_note', coalesce(p_note, ''), true);

  update public.patient_profiles
  set
    care_communications_consent = p_care_communications,
    marketing_consent = p_marketing
  where id = p_patient_id
  returning * into updated_patient;

  if updated_patient.id is null then
    raise exception 'Patient not found or access denied';
  end if;

  return updated_patient;
end;
$$;

revoke all on function public.set_patient_consents(uuid, boolean, boolean, text, text) from public;
grant execute on function public.set_patient_consents(uuid, boolean, boolean, text, text) to authenticated;
