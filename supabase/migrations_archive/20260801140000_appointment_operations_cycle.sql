alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check
  (status in ('pending','payment_pending','confirmed','arrived','in_consultation','completed','cancelled','no_show','rescheduling_required'));

alter table public.whatsapp_booking_requests drop constraint if exists whatsapp_booking_requests_status_check;
alter table public.whatsapp_booking_requests add constraint whatsapp_booking_requests_status_check check
  (status in ('collecting','pending_approval','confirmed','rejected','waitlisted','expired','cancelled'));

create table public.appointment_waitlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  booking_request_id uuid references public.whatsapp_booking_requests(id) on delete set null,
  patient_id uuid references public.patient_profiles(id) on delete set null,
  patient_name text not null,
  patient_phone text not null,
  service_id uuid not null references public.organization_services(id),
  location_id uuid references public.business_locations(id),
  resource_id uuid references public.booking_resources(id),
  preferred_date date,
  preferred_starts_at timestamptz,
  status text not null default 'waiting' check(status in ('waiting','offered','booked','expired','cancelled')),
  priority smallint not null default 100,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointment_waitlist_queue_idx on public.appointment_waitlist(organization_id,status,preferred_date,priority,created_at);
alter table public.appointment_waitlist enable row level security;
grant select,insert,update,delete on public.appointment_waitlist to authenticated;
create policy "members read waitlist" on public.appointment_waitlist for select to authenticated using(private.is_organization_member(organization_id,'member'));
create policy "admins insert waitlist" on public.appointment_waitlist for insert to authenticated with check(private.is_organization_member(organization_id,'admin'));
create policy "admins update waitlist" on public.appointment_waitlist for update to authenticated using(private.is_organization_member(organization_id,'admin')) with check(private.is_organization_member(organization_id,'admin'));
create policy "admins delete waitlist" on public.appointment_waitlist for delete to authenticated using(private.is_organization_member(organization_id,'admin'));

create or replace function public.decide_whatsapp_booking_request(p_organization_id uuid,p_request_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.whatsapp_booking_requests%rowtype; v_slug text; created jsonb; reply text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  if p_decision not in ('approve','reject','waitlist') then raise exception 'Invalid decision'; end if;
  select * into r from public.whatsapp_booking_requests where id=p_request_id and organization_id=p_organization_id for update;
  if r.id is null then raise exception 'Booking request not found'; end if;
  if r.status<>'pending_approval' then raise exception 'This request has already been decided'; end if;
  if p_decision='approve' then
    select slug into v_slug from public.booking_pages where organization_id=p_organization_id and active limit 1;
    created:=public.create_public_appointment_v2(v_slug,r.resource_id,r.location_id,r.service_id,r.patient_name,r.patient_phone,'',r.starts_at,coalesce(nullif(trim(p_note),''),'Approved from WhatsApp booking queue'),jsonb_build_object('care_communications_consent',true,'marketing_consent',false));
    update public.whatsapp_booking_requests set status='confirmed',appointment_id=(created->>'appointment_id')::uuid,decision_note=nullif(trim(coalesce(p_note,'')),''),decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=r.id;
    reply:='Your appointment is confirmed. Reference: '||(created->>'booking_reference')||'.';
  elsif p_decision='waitlist' then
    insert into public.appointment_waitlist(organization_id,booking_request_id,patient_name,patient_phone,service_id,location_id,resource_id,preferred_date,preferred_starts_at)
    values(p_organization_id,r.id,r.patient_name,r.patient_phone,r.service_id,r.location_id,r.resource_id,(r.starts_at at time zone 'Asia/Kolkata')::date,r.starts_at);
    update public.whatsapp_booking_requests set status='waitlisted',decision_note=nullif(trim(coalesce(p_note,'')),''),decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=r.id;
    reply:='The clinic added your request to the waitlist. You will be contacted if a suitable time becomes available.';
  else
    update public.whatsapp_booking_requests set status='rejected',decision_note=nullif(trim(coalesce(p_note,'')),''),decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=r.id;
    reply:='The requested appointment could not be confirmed. Please reply MENU to choose another available time.';
  end if;
  if r.conversation_id is not null then
    insert into public.messages(organization_id,conversation_id,organization_address,contact_address,service,direction,content,status,timestamp)
    select p_organization_id,r.conversation_id,c.organization_address,c.contact_address,'whatsapp','outgoing',jsonb_build_object('version','1','type','text','kind','text','text',reply),jsonb_build_object('status','queued','source','booking_decision'),now()
    from public.conversations c where c.id=r.conversation_id;
  end if;
  return jsonb_build_object('status',case p_decision when 'approve' then 'confirmed' when 'waitlist' then 'waitlisted' else 'rejected' end,'appointment_id',created->>'appointment_id');
exception when exclusion_violation then raise exception 'That time was just booked. Add the patient to the waitlist or offer another slot';
end; $$;
revoke all on function public.decide_whatsapp_booking_request(uuid,uuid,text,text) from public;
grant execute on function public.decide_whatsapp_booking_request(uuid,uuid,text,text) to authenticated;

create or replace function public.update_appointment_status(p_organization_id uuid,p_appointment_id uuid,p_status text)
returns void language plpgsql set search_path='' as $$
declare a public.appointments%rowtype; old_status text; reminder_channel text; reminder_recipient text;
begin
  if not private.is_organization_member(p_organization_id,'admin') then raise exception 'Administrator access required'; end if;
  select * into a from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if a.id is null then raise exception 'Appointment not found'; end if;
  old_status:=a.status;
  if not ((old_status='pending' and p_status in('confirmed','cancelled')) or (old_status='confirmed' and p_status in('arrived','completed','cancelled','no_show','rescheduling_required')) or (old_status='arrived' and p_status in('in_consultation','completed','cancelled')) or (old_status='in_consultation' and p_status in('completed','cancelled')) or (old_status='rescheduling_required' and p_status in('confirmed','cancelled')) or old_status=p_status) then raise exception 'Invalid appointment transition from % to %',old_status,p_status; end if;
  update public.appointments set status=p_status,updated_at=now() where id=p_appointment_id;
  insert into public.appointment_events(organization_id,appointment_id,event_type,actor_type,actor_id,details) values(p_organization_id,p_appointment_id,'status_changed','staff',auth.uid(),jsonb_build_object('from',old_status,'to',p_status));
  if p_status in('cancelled','completed','no_show','rescheduling_required') then update public.reminder_events set status='cancelled',updated_at=now() where appointment_id=p_appointment_id and status='scheduled'; end if;
  if p_status='cancelled' and a.care_communications_consent then
    reminder_channel:=case when nullif(trim(coalesce(a.customer_phone,'')),'') is not null then 'whatsapp' else 'email' end;reminder_recipient:=coalesce(nullif(trim(coalesce(a.customer_phone,'')),''),nullif(trim(coalesce(a.customer_email,'')),''));
    if reminder_recipient is not null then insert into public.reminder_events(organization_id,appointment_id,event_type,scheduled_for,channel,recipient,status,provider_response) values(p_organization_id,p_appointment_id,'cancellation',now(),reminder_channel,reminder_recipient,'scheduled',jsonb_build_object('purpose','manual_cancellation')) on conflict(appointment_id,event_type,channel) do update set scheduled_for=excluded.scheduled_for,recipient=excluded.recipient,status='scheduled',attempts=0,provider_response=excluded.provider_response,updated_at=now(); end if;
  end if;
end; $$;
revoke all on function public.update_appointment_status(uuid,uuid,text) from public;
grant execute on function public.update_appointment_status(uuid,uuid,text) to authenticated;
