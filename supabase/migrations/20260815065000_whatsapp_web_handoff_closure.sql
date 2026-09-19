create table if not exists private.whatsapp_booking_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.whatsapp_booking_sessions(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete restrict,
  consent_evidence_id uuid not null references public.whatsapp_booking_consent_evidence(id) on delete restrict,
  token_hash bytea not null unique,
  service_id uuid not null references public.organization_services(id),
  location_id uuid not null references public.business_locations(id),
  resource_id uuid not null references public.booking_resources(id),
  starts_at timestamptz not null,
  patient_name text not null,
  booking_contact_name text not null,
  booking_contact_phone text not null,
  patient_relationship text not null check (patient_relationship in ('self','child','parent','spouse','relative','other')),
  appointment_id uuid references public.appointments(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_booking_handoffs_expiry_idx
  on private.whatsapp_booking_handoffs (expires_at) where consumed_at is null;
alter table private.whatsapp_booking_handoffs enable row level security;
revoke all on private.whatsapp_booking_handoffs from public, anon, authenticated;

drop policy if exists whatsapp_booking_handoffs_deny_direct_access on private.whatsapp_booking_handoffs;
create policy whatsapp_booking_handoffs_deny_direct_access
  on private.whatsapp_booking_handoffs for all to public
  using (false) with check (false);

create or replace function private.sync_patient_appointment_trigger()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if coalesce(current_setting('omnirelay.defer_patient_sync',true),'off') <> 'on' then
    perform private.sync_patient_from_appointment(new.id);
  end if;
  return new;
end;$function$;
revoke all on function private.sync_patient_appointment_trigger() from public,anon,authenticated;

create or replace function public.create_whatsapp_booking_handoff(
  p_organization_id uuid,p_session_id uuid,p_conversation_id uuid,
  p_source_message_id uuid,p_consent_evidence_id uuid,p_context jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare token text;handoff_id uuid;expiry timestamptz:=now()+interval '10 minutes';
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if not exists(select 1 from public.whatsapp_booking_sessions where id=p_session_id and organization_id=p_organization_id and conversation_id=p_conversation_id) then raise exception 'Booking session mismatch'; end if;
  if not exists(select 1 from public.whatsapp_booking_consent_evidence where id=p_consent_evidence_id and organization_id=p_organization_id and source_message_id=p_source_message_id and action='accepted') then raise exception 'Accepted WhatsApp consent is required'; end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.whatsapp_booking_handoffs(
    organization_id,session_id,conversation_id,source_message_id,consent_evidence_id,token_hash,
    service_id,location_id,resource_id,starts_at,patient_name,booking_contact_name,
    booking_contact_phone,patient_relationship,expires_at
  ) values(
    p_organization_id,p_session_id,p_conversation_id,p_source_message_id,p_consent_evidence_id,
    extensions.digest(convert_to(token,'UTF8'),'sha256'),
    (p_context#>>'{service,id}')::uuid,(p_context#>>'{location,id}')::uuid,
    (p_context#>>'{resource,id}')::uuid,(p_context#>>'{slot,starts_at}')::timestamptz,
    trim(p_context->>'patient_name'),trim(p_context->>'booking_contact_name'),
    trim(p_context->>'booking_contact_phone'),p_context->>'patient_relationship',expiry
  ) returning id into handoff_id;
  return jsonb_build_object('handoff_id',handoff_id,'token',token,'expires_at',expiry);
end;$function$;

create or replace function public.get_whatsapp_booking_handoff(p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare h private.whatsapp_booking_handoffs%rowtype;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs
   where token_hash=extensions.digest(convert_to(p_token,'UTF8'),'sha256')
     and consumed_at is null and expires_at>now();
  if h.id is null then return null; end if;
  return jsonb_build_object('service_id',h.service_id,'location_id',h.location_id,'resource_id',h.resource_id,
    'starts_at',h.starts_at,'patient_name',h.patient_name,'booking_contact_name',h.booking_contact_name,
    'booking_contact_phone',h.booking_contact_phone,'patient_relationship',h.patient_relationship);
end;$function$;

create or replace function public.create_whatsapp_handoff_appointment(
  p_handoff_token text,p_slug text,p_resource_id uuid,p_location_id uuid,p_service_id uuid,
  p_customer_name text,p_customer_phone text,p_customer_email text,p_starts_at timestamptz,
  p_booking_contact_name text,p_booking_contact_phone text,p_patient_relationship text,
  p_patient_date_of_birth date default null,p_notes text default null,p_intake jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare h private.whatsapp_booking_handoffs%rowtype;result jsonb;v_appointment_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') and consumed_at is null and expires_at>now() for update;
  if h.id is null then raise exception 'WhatsApp booking handoff expired'; end if;
  if h.resource_id<>p_resource_id or h.location_id<>p_location_id or h.service_id<>p_service_id or h.starts_at<>p_starts_at then raise exception 'WhatsApp booking selection mismatch'; end if;
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

create or replace function public.create_whatsapp_handoff_payment_intent(
  p_handoff_token text,p_slug text,p_resource_id uuid,p_location_id uuid,p_service_id uuid,
  p_customer_name text,p_customer_phone text,p_customer_email text,p_starts_at timestamptz,
  p_selected_payment_mode text,p_booking_contact_name text,p_booking_contact_phone text,
  p_patient_relationship text,p_patient_date_of_birth date default null,p_notes text default null,
  p_intake jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare h private.whatsapp_booking_handoffs%rowtype;result jsonb;v_appointment_id uuid;
begin
  if coalesce((select auth.jwt()->>'role'),'')<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  select * into h from private.whatsapp_booking_handoffs where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') and consumed_at is null and expires_at>now() for update;
  if h.id is null then raise exception 'WhatsApp booking handoff expired'; end if;
  if h.resource_id<>p_resource_id or h.location_id<>p_location_id or h.service_id<>p_service_id or h.starts_at<>p_starts_at then raise exception 'WhatsApp booking selection mismatch'; end if;
  perform set_config('omnirelay.defer_patient_sync','on',true);
  result:=public.create_public_payment_intent_v3(p_slug,p_resource_id,p_location_id,p_service_id,p_customer_name,p_customer_phone,p_customer_email,p_starts_at,p_selected_payment_mode,p_notes,p_intake);
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
  select * into h from private.whatsapp_booking_handoffs where token_hash=extensions.digest(convert_to(p_handoff_token,'UTF8'),'sha256') and consumed_at is null and expires_at>now() for update;
  if h.id is null then raise exception 'WhatsApp booking handoff expired or already used'; end if;
  select c.appointment_id into appointment_id from private.customer_booking_access c
   where c.booking_reference=upper(trim(p_booking_reference)) and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  select * into a from public.appointments where id=appointment_id and organization_id=h.organization_id for update;
  if a.id is null or a.id is distinct from h.appointment_id or a.status<>'confirmed' then raise exception 'Confirmed appointment does not match this WhatsApp handoff'; end if;
  perform public.link_whatsapp_booking_consent(h.consent_evidence_id,a.id);
  update public.patient_identity_verification_events set patient_id=a.patient_id
   where organization_id=h.organization_id and conversation_id=h.conversation_id and patient_id is null;
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
    jsonb_build_object('pending',queued_at,'source','whatsapp_booking_handoff'),queued_at
  from public.conversations c where c.id=h.conversation_id and c.organization_id=h.organization_id;
  update public.whatsapp_booking_sessions set state='welcome',context='{}'::jsonb,updated_at=now() where id=h.session_id;
  update private.whatsapp_booking_handoffs set consumed_at=now() where id=h.id;
  return true;
end;$function$;

revoke all on function public.create_whatsapp_booking_handoff(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.get_whatsapp_booking_handoff(text) from public,anon,authenticated;
revoke all on function public.create_whatsapp_handoff_appointment(text,text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.create_whatsapp_handoff_payment_intent(text,text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,text,date,text,jsonb) from public,anon,authenticated;
revoke all on function public.complete_whatsapp_booking_handoff(text,text,text) from public,anon,authenticated;
grant execute on function public.create_whatsapp_booking_handoff(uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.get_whatsapp_booking_handoff(text) to service_role;
grant execute on function public.create_whatsapp_handoff_appointment(text,text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,date,text,jsonb) to service_role;
grant execute on function public.create_whatsapp_handoff_payment_intent(text,text,uuid,uuid,uuid,text,text,text,timestamptz,text,text,text,text,date,text,jsonb) to service_role;
grant execute on function public.complete_whatsapp_booking_handoff(text,text,text) to service_role;

do $block$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='cleanup-whatsapp-booking-handoffs';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('cleanup-whatsapp-booking-handoffs','41 3 * * *',$cron$delete from private.whatsapp_booking_handoffs where created_at<now()-interval '24 hours'$cron$);
end;$block$;
