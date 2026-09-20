create or replace function public.decide_whatsapp_booking_request(
  p_organization_id uuid,
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  r public.whatsapp_booking_requests%rowtype;
  v_slug text;
  created jsonb;
  reply text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approve','reject','waitlist') then
    raise exception 'Invalid decision';
  end if;

  select * into r
  from public.whatsapp_booking_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;

  if r.id is null then raise exception 'Booking request not found'; end if;
  if r.status<>'pending_approval' then raise exception 'This request has already been decided'; end if;

  if p_decision='approve' then
    select slug into v_slug
    from public.booking_pages
    where organization_id=p_organization_id and active
    limit 1;

    created:=public.create_public_appointment_v2(
      v_slug,r.resource_id,r.location_id,r.service_id,r.patient_name,r.patient_phone,'',r.starts_at,
      coalesce(nullif(trim(p_note),''),'Approved from WhatsApp booking queue'),
      jsonb_build_object('care_communications_consent',true,'marketing_consent',false)
    );
    update public.whatsapp_booking_requests
    set status='confirmed',appointment_id=(created->>'appointment_id')::uuid,
        decision_note=nullif(trim(coalesce(p_note,'')),''),decided_by=auth.uid(),
        decided_at=now(),updated_at=now()
    where id=r.id;
    reply:='Your appointment is confirmed. Reference: '||(created->>'booking_reference')||'.';
  elsif p_decision='waitlist' then
    insert into public.appointment_waitlist(
      organization_id,booking_request_id,patient_name,patient_phone,service_id,
      location_id,resource_id,preferred_date,preferred_starts_at
    ) values (
      p_organization_id,r.id,r.patient_name,r.patient_phone,r.service_id,
      r.location_id,r.resource_id,(r.starts_at at time zone 'Asia/Kolkata')::date,r.starts_at
    );
    update public.whatsapp_booking_requests
    set status='waitlisted',decision_note=nullif(trim(coalesce(p_note,'')),''),
        decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=r.id;
    reply:='The clinic added your request to the waitlist. You will be contacted if a suitable time becomes available.';
  else
    update public.whatsapp_booking_requests
    set status='rejected',decision_note=nullif(trim(coalesce(p_note,'')),''),
        decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=r.id;
    reply:='The requested appointment could not be confirmed. Please reply MENU to choose another available time.';
  end if;

  if r.conversation_id is not null then
    insert into public.messages(
      organization_id,conversation_id,organization_address,contact_address,
      service,direction,content,status,timestamp
    )
    select p_organization_id,r.conversation_id,c.organization_address,c.contact_address,
      'whatsapp','outgoing',
      jsonb_build_object('version','1','type','text','kind','text','text',reply),
      jsonb_build_object('pending',now(),'source','booking_decision'),
      now()
    from public.conversations c
    where c.id=r.conversation_id and c.organization_id=p_organization_id;
  end if;

  return jsonb_build_object(
    'status',case p_decision when 'approve' then 'confirmed' when 'waitlist' then 'waitlisted' else 'rejected' end,
    'appointment_id',created->>'appointment_id'
  );
exception
  when exclusion_violation then
    raise exception 'That time was just booked. Add the patient to the waitlist or offer another slot';
end;
$function$;

revoke all on function public.decide_whatsapp_booking_request(uuid,uuid,text,text) from public,anon;
grant execute on function public.decide_whatsapp_booking_request(uuid,uuid,text,text) to authenticated;
