-- Qualify booking-request lookups and keep local identity distinct from table columns.
create or replace function public.complete_whatsapp_booking_handoff(p_handoff_token text,p_booking_reference text,p_manage_token text)
returns boolean language plpgsql security definer set search_path='' as $$
declare h private.whatsapp_booking_handoffs%rowtype;v_appointment_id uuid;a public.appointments%rowtype;
  base_url text;manage_url text;queued_at timestamptz:=now();
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs
   where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') for update;
  if h.id is null then raise exception 'WhatsApp booking handoff is invalid'; end if;
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
   where c.booking_reference=upper(trim(p_booking_reference)) and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  select * into a from public.appointments ap where ap.id=v_appointment_id and ap.organization_id=h.organization_id for update;
  if a.id is null or a.id is distinct from h.appointment_id or a.status<>'confirmed' then raise exception 'Confirmed appointment does not match this WhatsApp handoff'; end if;
  if h.consumed_at is not null then
    return exists(select 1 from public.whatsapp_booking_requests wbr where wbr.appointment_id=a.id and wbr.status='confirmed');
  end if;
  perform public.link_whatsapp_booking_consent(h.consent_evidence_id,a.id);
  insert into public.whatsapp_booking_requests(organization_id,session_id,conversation_id,appointment_id,
    patient_name,patient_phone,service_id,location_id,resource_id,starts_at,status,booking_consent_evidence_id)
  select h.organization_id,h.session_id,h.conversation_id,a.id,h.patient_name,a.customer_phone,h.service_id,h.location_id,h.resource_id,h.starts_at,'confirmed',h.consent_evidence_id
  where not exists(select 1 from public.whatsapp_booking_requests wbr where wbr.appointment_id=a.id);
  select regexp_replace(coalesce(patient_portal_base_url,''),'/+$','') into base_url from public.whatsapp_booking_settings where organization_id=h.organization_id;
  manage_url:=base_url||'/booking/manage?reference='||p_booking_reference||'&token='||p_manage_token;
  insert into public.messages(organization_id,conversation_id,organization_address,contact_address,service,direction,content,status,"timestamp")
  select h.organization_id,h.conversation_id,c.organization_address,c.contact_address,'whatsapp','outgoing',
    jsonb_build_object('version','1','type','text','kind','text','text','Appointment confirmed. Reference: '||p_booking_reference||E'.\nManage, reschedule or cancel securely: '||manage_url),
    jsonb_build_object('pending',queued_at,'source','whatsapp_booking_handoff','handoff_id',h.id),queued_at
  from public.conversations c where c.id=h.conversation_id and c.organization_id=h.organization_id
    and not exists(select 1 from public.messages m where m.conversation_id=h.conversation_id and m.status->>'source'='whatsapp_booking_handoff' and m.status->>'handoff_id'=h.id::text);
  update public.whatsapp_booking_sessions set state='welcome',context='{}'::jsonb,updated_at=now() where id=h.session_id;
  update private.whatsapp_booking_handoffs set consumed_at=now() where id=h.id;
  return true;
end $$;
revoke all on function public.complete_whatsapp_booking_handoff(text,text,text) from public,anon,authenticated;
grant execute on function public.complete_whatsapp_booking_handoff(text,text,text) to service_role;
