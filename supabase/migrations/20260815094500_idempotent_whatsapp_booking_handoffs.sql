create or replace function public.create_whatsapp_handoff_appointment(
  p_handoff_token text,p_slug text,p_resource_id uuid,p_location_id uuid,p_service_id uuid,
  p_customer_name text,p_customer_phone text,p_customer_email text,p_starts_at timestamptz,
  p_booking_contact_name text,p_booking_contact_phone text,p_patient_relationship text,
  p_patient_date_of_birth date default null,p_notes text default null,p_intake jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare h private.whatsapp_booking_handoffs%rowtype;result jsonb;v_appointment_id uuid;
  existing_appointment public.appointments%rowtype;existing_reference text;replacement_token text;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs
   where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') and consumed_at is null for update;
  if h.id is null then raise exception 'WhatsApp booking handoff expired or already used'; end if;
  if h.resource_id<>p_resource_id or h.location_id<>p_location_id or h.service_id<>p_service_id or h.starts_at<>p_starts_at then raise exception 'WhatsApp booking selection mismatch'; end if;

  -- A previous request may have created the appointment before its response
  -- failed. Return the same appointment with a newly usable management token.
  if h.appointment_id is not null then
    select * into existing_appointment from public.appointments
     where id=h.appointment_id and organization_id=h.organization_id and status='confirmed';
    if existing_appointment.id is null then raise exception 'Existing WhatsApp appointment is unavailable'; end if;
    select booking_reference into existing_reference from private.customer_booking_access
     where appointment_id=existing_appointment.id for update;
    if existing_reference is null then raise exception 'Existing booking access is unavailable'; end if;
    replacement_token:=encode(extensions.gen_random_bytes(32),'hex');
    update private.customer_booking_access
       set token_hash=extensions.digest(convert_to(replacement_token,'UTF8'),'sha256')
     where appointment_id=existing_appointment.id;
    return jsonb_build_object(
      'appointment_id',existing_appointment.id,'booking_reference',existing_reference,
      'manage_token',replacement_token,'starts_at',existing_appointment.starts_at,
      'ends_at',existing_appointment.ends_at,'recovered',true
    );
  end if;

  if h.expires_at<=now() then raise exception 'WhatsApp booking handoff expired'; end if;
  perform set_config('omnirelay.defer_patient_sync','on',true);
  result:=public.create_public_appointment_v2(p_slug,p_resource_id,p_location_id,p_service_id,p_customer_name,p_customer_phone,p_customer_email,p_starts_at,p_notes,p_intake);
  v_appointment_id:=(result->>'appointment_id')::uuid;
  update public.appointments set source='whatsapp',booking_contact_name=trim(p_booking_contact_name),
    booking_contact_phone=trim(p_booking_contact_phone),patient_relationship=p_patient_relationship,
    patient_date_of_birth=p_patient_date_of_birth,booking_phone_verified_at=now()
  where id=v_appointment_id and organization_id=h.organization_id;
  perform set_config('omnirelay.defer_patient_sync','off',true);
  perform private.sync_patient_from_appointment(v_appointment_id);
  update private.whatsapp_booking_handoffs set appointment_id=v_appointment_id where id=h.id;
  return result;
exception when others then
  perform set_config('omnirelay.defer_patient_sync','off',true);
  raise;
end;$function$;

create or replace function public.complete_whatsapp_booking_handoff(
  p_handoff_token text,p_booking_reference text,p_manage_token text
) returns boolean language plpgsql security definer set search_path=''
as $function$
declare h private.whatsapp_booking_handoffs%rowtype;appointment_id uuid;a public.appointments%rowtype;
  base_url text;manage_url text;queued_at timestamptz:=now();
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs
   where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') for update;
  if h.id is null then raise exception 'WhatsApp booking handoff is invalid'; end if;
  select c.appointment_id into appointment_id from private.customer_booking_access c
   where c.booking_reference=upper(trim(p_booking_reference)) and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  select * into a from public.appointments where id=appointment_id and organization_id=h.organization_id for update;
  if a.id is null or a.id is distinct from h.appointment_id or a.status<>'confirmed' then raise exception 'Confirmed appointment does not match this WhatsApp handoff'; end if;
  if h.consumed_at is not null then
    return exists(select 1 from public.whatsapp_booking_requests where appointment_id=a.id and status='confirmed');
  end if;

  perform public.link_whatsapp_booking_consent(h.consent_evidence_id,a.id);
  insert into public.whatsapp_booking_requests(organization_id,session_id,conversation_id,appointment_id,
    patient_name,patient_phone,service_id,location_id,resource_id,starts_at,status,booking_consent_evidence_id)
  select h.organization_id,h.session_id,h.conversation_id,a.id,h.patient_name,a.customer_phone,h.service_id,h.location_id,h.resource_id,h.starts_at,'confirmed',h.consent_evidence_id
  where not exists(select 1 from public.whatsapp_booking_requests where appointment_id=a.id);
  select regexp_replace(coalesce(patient_portal_base_url,''),'/+$','') into base_url from public.whatsapp_booking_settings where organization_id=h.organization_id;
  manage_url:=base_url||'/booking/manage?reference='||p_booking_reference||'&token='||p_manage_token;
  insert into public.messages(organization_id,conversation_id,organization_address,contact_address,service,direction,content,status,"timestamp")
  select h.organization_id,h.conversation_id,c.organization_address,c.contact_address,'whatsapp','outgoing',
    jsonb_build_object('version','1','type','text','kind','text','text',
      'Appointment confirmed. Reference: '||p_booking_reference||E'.\nManage, reschedule or cancel securely: '||manage_url),
    jsonb_build_object('pending',queued_at,'source','whatsapp_booking_handoff','handoff_id',h.id),queued_at
  from public.conversations c where c.id=h.conversation_id and c.organization_id=h.organization_id
    and not exists(select 1 from public.messages m where m.conversation_id=h.conversation_id and m.status->>'source'='whatsapp_booking_handoff' and m.status->>'handoff_id'=h.id::text);
  update public.whatsapp_booking_sessions set state='welcome',context='{}'::jsonb,updated_at=now() where id=h.session_id;
  update private.whatsapp_booking_handoffs set consumed_at=now() where id=h.id;
  return true;
end;$function$;

revoke all on function public.create_whatsapp_handoff_appointment(text,text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.complete_whatsapp_booking_handoff(text,text,text) from public,anon,authenticated;
grant execute on function public.create_whatsapp_handoff_appointment(text,text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,date,text,jsonb) to service_role;
grant execute on function public.complete_whatsapp_booking_handoff(text,text,text) to service_role;
