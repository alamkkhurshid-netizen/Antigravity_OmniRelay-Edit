-- A staff member using the Follow-up Desk has verified the patient is present.
-- Keep that operational signal in the appointment lifecycle without requiring
-- a separate arrival click. Existing arrived/in-consultation/completed states
-- are never changed.
create or replace function public.set_appointment_follow_up(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_follow_up_at timestamptz,
  p_note text default null
) returns void language plpgsql set search_path = '' as $$
declare
  appointment_row public.appointments%rowtype;
  reminder_channel text;
  reminder_recipient text;
begin
  if not private.is_organization_member(p_organization_id, 'admin') then raise exception 'Administrator access required'; end if;
  if p_follow_up_at is not null and p_follow_up_at <= now() then raise exception 'Follow-up must be scheduled in the future'; end if;
  update public.appointments set follow_up_at=p_follow_up_at,follow_up_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now()
  where id=p_appointment_id and organization_id=p_organization_id returning * into appointment_row;
  if appointment_row.id is null then raise exception 'Appointment not found'; end if;
  if appointment_row.status='confirmed' then
    perform public.update_appointment_status(p_organization_id,p_appointment_id,'arrived');
    select * into appointment_row from public.appointments where id=p_appointment_id and organization_id=p_organization_id;
  end if;
  update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=p_appointment_id and event_type='follow_up' and status='scheduled';
  if p_follow_up_at is not null and appointment_row.care_communications_consent then
    reminder_channel:=case when nullif(trim(coalesce(appointment_row.customer_phone,'')),'') is not null then 'whatsapp' else 'email' end;
    reminder_recipient:=coalesce(nullif(trim(coalesce(appointment_row.customer_phone,'')),''),nullif(trim(coalesce(appointment_row.customer_email,'')),''));
    if reminder_recipient is not null then
      insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient,status,provider_response)
      values(p_organization_id,p_appointment_id,'follow_up',p_follow_up_at,reminder_channel,reminder_recipient,'scheduled',jsonb_build_object('note',nullif(trim(coalesce(p_note,'')),'')))
      on conflict(appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,recipient=excluded.recipient,status='scheduled',attempts=0,provider_response=excluded.provider_response,updated_at=now();
    end if;
  end if;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details)
  values(p_organization_id,p_appointment_id,'follow_up_changed','staff',auth.uid(),jsonb_build_object('follow_up_at',p_follow_up_at,'note',nullif(trim(coalesce(p_note,'')),'')));
end;
$$;
