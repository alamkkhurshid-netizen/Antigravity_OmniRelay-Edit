create or replace function public.issue_clinical_prescription(
  p_organization_id uuid,
  p_patient_id uuid,
  p_encounter_id uuid default null,
  p_appointment_id uuid default null,
  p_diagnosis text default null,
  p_advice text default null,
  p_tests_requested text default null,
  p_follow_up_at timestamptz default null,
  p_medicines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_prescription public.prescriptions%rowtype;
  v_medicine jsonb;
  v_item public.prescription_items%rowtype;
  v_index integer := 0;
  v_time text;
  v_start_date date;
  v_next_run timestamptz;
  v_days integer;
  v_reminder_count integer := 0;
  v_consent boolean := false;
  v_items jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;

  if not private.is_organization_member(p_organization_id, 'admin') then
    raise exception 'Only workspace owners and administrators can issue prescriptions.' using errcode = '42501';
  end if;

  select pp.care_communications_consent
    into v_consent
  from public.patient_profiles pp
  where pp.id = p_patient_id and pp.organization_id = p_organization_id;
  if not found then
    raise exception 'Patient not found.' using errcode = 'P0002';
  end if;

  if p_encounter_id is not null and not exists (
    select 1 from public.patient_encounters pe
    where pe.id = p_encounter_id
      and pe.patient_id = p_patient_id
      and pe.organization_id = p_organization_id
  ) then
    raise exception 'The selected visit does not belong to this patient.' using errcode = '23503';
  end if;

  if p_appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id
      and a.patient_id = p_patient_id
      and a.organization_id = p_organization_id
  ) then
    raise exception 'The selected appointment does not belong to this patient.' using errcode = '23503';
  end if;

  if jsonb_typeof(p_medicines) <> 'array'
     or jsonb_array_length(p_medicines) < 1
     or jsonb_array_length(p_medicines) > 20 then
    raise exception 'A prescription must contain between 1 and 20 medicines.' using errcode = '22023';
  end if;

  if p_follow_up_at is not null and p_follow_up_at <= now() then
    raise exception 'Follow-up must be in the future.' using errcode = '22023';
  end if;

  insert into public.prescriptions (
    organization_id, patient_id, encounter_id, appointment_id,
    prescription_number, issued_at, status, diagnosis, advice,
    tests_requested, follow_up_at, created_by
  ) values (
    p_organization_id, p_patient_id, p_encounter_id, p_appointment_id,
    'RX-' || to_char(clock_timestamp() at time zone 'Asia/Kolkata', 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    clock_timestamp(), 'issued', nullif(btrim(p_diagnosis), ''),
    nullif(btrim(p_advice), ''), nullif(btrim(p_tests_requested), ''),
    p_follow_up_at, v_user_id
  ) returning * into v_prescription;

  for v_medicine in select value from jsonb_array_elements(p_medicines)
  loop
    if nullif(btrim(v_medicine->>'medicine_name'), '') is null
       or nullif(btrim(v_medicine->>'frequency'), '') is null then
      raise exception 'Every medicine requires a name and frequency.' using errcode = '22023';
    end if;

    insert into public.prescription_items (
      organization_id, prescription_id, medicine_name, dosage, frequency,
      duration, instructions, catalog_entry_id, medicine_identifier,
      medicine_source, catalogue_snapshot, sort_order
    ) values (
      p_organization_id, v_prescription.id, btrim(v_medicine->>'medicine_name'),
      nullif(btrim(v_medicine->>'dosage'), ''), btrim(v_medicine->>'frequency'),
      nullif(btrim(v_medicine->>'duration'), ''), nullif(btrim(v_medicine->>'instructions'), ''),
      nullif(v_medicine->>'catalog_entry_id', '')::bigint,
      nullif(btrim(v_medicine->>'medicine_identifier'), ''),
      coalesce(nullif(btrim(v_medicine->>'medicine_source'), ''), 'manual'),
      coalesce(v_medicine->'catalogue_snapshot', '{}'::jsonb), v_index
    ) returning * into v_item;

    v_items := v_items || jsonb_build_array(to_jsonb(v_item));

    if coalesce((v_medicine->>'reminder_enabled')::boolean, false) and v_consent then
      v_days := least(365, greatest(1, coalesce((v_medicine->>'reminder_days')::integer, 1)));
      for v_time in select value #>> '{}' from jsonb_array_elements(coalesce(v_medicine->'reminder_times', '[]'::jsonb))
      loop
        if v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'Reminder time must use HH:MM format.' using errcode = '22023';
        end if;
        v_start_date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
        v_next_run := (v_start_date::text || ' ' || v_time || ' Asia/Kolkata')::timestamptz;
        if v_next_run <= clock_timestamp() then
          v_start_date := v_start_date + 1;
          v_next_run := (v_start_date::text || ' ' || v_time || ' Asia/Kolkata')::timestamptz;
        end if;

        insert into public.care_reminders (
          organization_id, patient_id, prescription_id, prescription_item_id,
          encounter_id, reminder_type, title, instructions, schedule_kind,
          time_of_day, starts_on, ends_on, timezone, channel, status,
          consent_snapshot, next_run_at, created_by
        ) values (
          p_organization_id, p_patient_id, v_prescription.id, v_item.id,
          p_encounter_id, 'medication',
          btrim(v_medicine->>'medicine_name') || ' · ' || coalesce(nullif(btrim(v_medicine->>'dosage'), ''), btrim(v_medicine->>'frequency')),
          nullif(btrim(v_medicine->>'instructions'), ''), 'daily', v_time::time,
          v_start_date, v_start_date + (v_days - 1), 'Asia/Kolkata', 'whatsapp',
          'active', true, v_next_run, v_user_id
        );
        v_reminder_count := v_reminder_count + 1;
      end loop;
    end if;
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object(
    'prescription', to_jsonb(v_prescription) || jsonb_build_object('items', v_items),
    'reminder_count', v_reminder_count,
    'reminders_skipped_for_consent', (not v_consent) and exists (
      select 1 from jsonb_array_elements(p_medicines) m
      where coalesce((m->>'reminder_enabled')::boolean, false)
    )
  );
end;
$$;

revoke all on function public.issue_clinical_prescription(uuid, uuid, uuid, uuid, text, text, text, timestamptz, jsonb) from public, anon;
grant execute on function public.issue_clinical_prescription(uuid, uuid, uuid, uuid, text, text, text, timestamptz, jsonb) to authenticated;
