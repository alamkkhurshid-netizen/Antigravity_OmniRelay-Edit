create unique index if not exists patient_encounters_appointment_unique
  on public.patient_encounters (appointment_id) where appointment_id is not null;
create unique index if not exists patient_care_tasks_appointment_follow_up_unique
  on public.patient_care_tasks (appointment_id,task_type)
  where appointment_id is not null and task_type='follow_up';

create or replace function public.complete_appointment_visit(
  p_organization_id uuid, p_appointment_id uuid, p_clinical_note text,
  p_diagnosis text default null, p_treatment_plan text default null,
  p_follow_up_at timestamptz default null, p_follow_up_note text default null,
  p_encounter_type text default 'consultation'
) returns uuid language plpgsql set search_path = '' as $$
declare
  appointment_row public.appointments%rowtype;
  encounter_id uuid; actor_id uuid := auth.uid();
  clean_note text := nullif(trim(coalesce(p_clinical_note,'')),'');
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if clean_note is null then raise exception 'Clinical note is required'; end if;
  if p_encounter_type not in ('consultation','follow_up','procedure','vaccination','other') then raise exception 'Invalid encounter type'; end if;
  if p_follow_up_at is not null and p_follow_up_at <= now() then raise exception 'Follow-up must be scheduled in the future'; end if;

  select * into appointment_row from public.appointments
  where id=p_appointment_id and organization_id=p_organization_id for update;
  if appointment_row.id is null then raise exception 'Appointment not found'; end if;
  if appointment_row.status not in ('confirmed','arrived','in_consultation','completed') then
    raise exception 'Appointment cannot be completed from status %',appointment_row.status;
  end if;
  if appointment_row.patient_id is null then
    perform private.sync_patient_from_appointment(appointment_row.id);
    select * into appointment_row from public.appointments
      where id=p_appointment_id and organization_id=p_organization_id;
  end if;
  if appointment_row.patient_id is null then raise exception 'Patient identity could not be resolved'; end if;
  if appointment_row.status <> 'completed' then
    perform public.update_appointment_status(p_organization_id,p_appointment_id,'completed');
  end if;

  insert into public.patient_encounters(
    organization_id,patient_id,appointment_id,encounter_type,occurred_at,diagnosis,
    clinical_note,treatment_plan,follow_up_at,follow_up_status,created_by
  ) values (
    p_organization_id,appointment_row.patient_id,p_appointment_id,p_encounter_type,now(),
    nullif(trim(coalesce(p_diagnosis,'')),''),clean_note,
    nullif(trim(coalesce(p_treatment_plan,'')),''),p_follow_up_at,
    case when p_follow_up_at is null then 'not_required' else 'scheduled' end,actor_id
  ) on conflict (appointment_id) where appointment_id is not null do update set
    encounter_type=excluded.encounter_type,diagnosis=excluded.diagnosis,clinical_note=excluded.clinical_note,
    treatment_plan=excluded.treatment_plan,follow_up_at=excluded.follow_up_at,
    follow_up_status=case when excluded.follow_up_at is null then 'not_required'
      when public.patient_encounters.follow_up_status='completed' then 'completed' else 'scheduled' end,
    updated_at=now()
  returning id into encounter_id;

  perform public.set_appointment_follow_up(p_organization_id,p_appointment_id,p_follow_up_at,p_follow_up_note);
  if p_follow_up_at is not null then
    insert into public.patient_care_tasks(
      organization_id,patient_id,encounter_id,appointment_id,task_type,title,details,
      due_at,priority,status,assigned_to,created_by
    ) values (
      p_organization_id,appointment_row.patient_id,encounter_id,p_appointment_id,'follow_up',
      'Patient follow-up',coalesce(nullif(trim(coalesce(p_follow_up_note,'')),''),'Follow up after completed appointment'),
      p_follow_up_at,'normal','open',actor_id,actor_id
    ) on conflict (appointment_id,task_type) where appointment_id is not null and task_type='follow_up'
    do update set encounter_id=excluded.encounter_id,patient_id=excluded.patient_id,details=excluded.details,
      due_at=excluded.due_at,status='open',assigned_to=excluded.assigned_to,
      completed_at=null,completed_by=null,updated_at=now();
  else
    update public.patient_care_tasks set status='cancelled',updated_at=now()
    where appointment_id=p_appointment_id and task_type='follow_up' and status in ('open','in_progress');
  end if;
  return encounter_id;
end;
$$;

revoke all on function public.complete_appointment_visit(uuid,uuid,text,text,text,timestamptz,text,text) from public,anon;
grant execute on function public.complete_appointment_visit(uuid,uuid,text,text,text,timestamptz,text,text) to authenticated;
