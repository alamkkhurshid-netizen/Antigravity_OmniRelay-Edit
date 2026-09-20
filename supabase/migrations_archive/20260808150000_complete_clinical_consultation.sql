create or replace function public.complete_clinical_consultation(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_encounter_type text default 'consultation',
  p_diagnosis text default null,
  p_clinical_note text default null,
  p_treatment_plan text default null,
  p_follow_up_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
  e public.patient_encounters%rowtype;
  reminder_at timestamptz;
  reminder_created boolean := false;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then raise exception 'Administrator access required'; end if;
  if p_encounter_type not in ('consultation','follow_up','procedure','vaccination','other') then raise exception 'Invalid encounter type'; end if;
  if nullif(trim(coalesce(p_clinical_note, '')), '') is null then raise exception 'Clinical note is required before completing a consultation'; end if;
  if p_follow_up_at is not null and p_follow_up_at <= now() then raise exception 'Follow-up must be scheduled in the future'; end if;

  select * into a from public.appointments
  where id = p_appointment_id and organization_id = p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  if a.patient_id is null then raise exception 'This appointment is not linked to a patient profile'; end if;
  if a.status not in ('confirmed','arrived','in_consultation') then raise exception 'Only an active consultation can be completed'; end if;
  if exists (select 1 from public.patient_encounters where organization_id = p_organization_id and appointment_id = p_appointment_id) then
    raise exception 'A clinical visit is already recorded for this appointment';
  end if;

  insert into public.patient_encounters (
    organization_id, patient_id, appointment_id, encounter_type, occurred_at,
    diagnosis, clinical_note, treatment_plan, follow_up_at, follow_up_status, created_by
  ) values (
    p_organization_id, a.patient_id, a.id, p_encounter_type, now(),
    nullif(trim(coalesce(p_diagnosis, '')), ''), trim(p_clinical_note),
    nullif(trim(coalesce(p_treatment_plan, '')), ''), p_follow_up_at,
    case when p_follow_up_at is null then 'not_required' else 'scheduled' end, auth.uid()
  ) returning * into e;

  perform public.update_appointment_status(p_organization_id, p_appointment_id, 'completed');

  if p_follow_up_at is not null then
    reminder_at := greatest(now() + interval '5 minutes', p_follow_up_at - interval '24 hours');
    insert into public.care_reminders (
      organization_id, patient_id, encounter_id, reminder_type, title, instructions,
      schedule_kind, scheduled_for, timezone, channel, status, consent_snapshot, next_run_at, created_by
    ) values (
      p_organization_id, a.patient_id, e.id, 'follow_up', 'Follow-up visit reminder',
      'Please confirm or reschedule your follow-up visit with the clinic.', 'one_time', reminder_at,
      'Asia/Kolkata', 'whatsapp', 'active', a.care_communications_consent, reminder_at, auth.uid()
    );
    reminder_created := true;
  end if;

  return jsonb_build_object(
    'encounter_id', e.id, 'patient_id', a.patient_id, 'appointment_status', 'completed',
    'reminder_created', reminder_created,
    'delivery_blocked', p_follow_up_at is not null and not a.care_communications_consent
  );
end;
$$;

revoke all on function public.complete_clinical_consultation(uuid,uuid,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.complete_clinical_consultation(uuid,uuid,text,text,text,text,timestamptz) to authenticated;
