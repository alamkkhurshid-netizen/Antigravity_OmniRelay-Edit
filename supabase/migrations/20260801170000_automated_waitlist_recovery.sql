alter table public.whatsapp_booking_settings
  add column if not exists waitlist_offer_minutes integer not null default 30
  check (waitlist_offer_minutes between 5 and 120);

create table public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waitlist_id uuid not null references public.appointment_waitlist(id) on delete cascade,
  service_id uuid not null references public.organization_services(id),
  location_id uuid not null references public.business_locations(id),
  resource_id uuid not null references public.booking_resources(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','revoked')),
  expires_at timestamptz not null,
  message_id uuid references public.messages(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (expires_at > created_at)
);

create index waitlist_offers_org_status_idx on public.waitlist_offers(organization_id,status,expires_at);
create index waitlist_offers_waitlist_idx on public.waitlist_offers(waitlist_id,created_at desc);
create unique index waitlist_offers_one_pending_slot_idx
  on public.waitlist_offers(organization_id,resource_id,starts_at,ends_at)
  where status='pending';

alter table public.waitlist_offers enable row level security;
grant select,insert,update,delete on public.waitlist_offers to authenticated;
create policy "members read waitlist offers" on public.waitlist_offers for select to authenticated
  using (private.is_organization_member(organization_id,'member'));
create policy "admins insert waitlist offers" on public.waitlist_offers for insert to authenticated
  with check (private.is_organization_member(organization_id,'admin'));
create policy "admins update waitlist offers" on public.waitlist_offers for update to authenticated
  using (private.is_organization_member(organization_id,'admin'))
  with check (private.is_organization_member(organization_id,'admin'));
create policy "admins delete waitlist offers" on public.waitlist_offers for delete to authenticated
  using (private.is_organization_member(organization_id,'admin'));

create or replace function private.queue_waitlist_offer(
  p_organization_id uuid,
  p_service_id uuid,
  p_location_id uuid,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_wait public.appointment_waitlist%rowtype;
  v_conversation public.conversations%rowtype;
  v_offer_id uuid;
  v_message_id uuid;
  v_minutes integer;
  v_expires timestamptz;
  v_body text;
begin
  if p_starts_at <= now() then return null; end if;
  if exists (
    select 1 from public.appointments a
    where a.organization_id=p_organization_id and a.resource_id=p_resource_id
      and a.status in ('pending','payment_pending','confirmed')
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
  ) then return null; end if;
  if exists (
    select 1 from public.waitlist_offers o
    where o.organization_id=p_organization_id and o.resource_id=p_resource_id
      and o.starts_at=p_starts_at and o.ends_at=p_ends_at and o.status='pending'
  ) then return null; end if;

  select w.* into v_wait
  from public.appointment_waitlist w
  where w.organization_id=p_organization_id and w.service_id=p_service_id
    and w.status='waiting'
    and (w.location_id is null or w.location_id=p_location_id)
    and (w.resource_id is null or w.resource_id=p_resource_id)
    and (w.preferred_date is null or w.preferred_date=p_starts_at::date)
    and (w.preferred_starts_at is null or w.preferred_starts_at=p_starts_at)
  order by w.priority asc, w.created_at asc
  for update skip locked
  limit 1;
  if v_wait.id is null then return null; end if;

  select coalesce(s.waitlist_offer_minutes,30) into v_minutes
  from public.whatsapp_booking_settings s where s.organization_id=p_organization_id;
  v_minutes := coalesce(v_minutes,30);
  v_expires := now() + make_interval(mins => v_minutes);

  select c.* into v_conversation
  from public.whatsapp_booking_requests r
  join public.conversations c on c.id=r.conversation_id
  where r.id=v_wait.booking_request_id and c.organization_id=p_organization_id
  limit 1;
  if v_conversation.id is null then
    select c.* into v_conversation from public.conversations c
    where c.organization_id=p_organization_id and c.service='whatsapp'
      and regexp_replace(c.contact_address,'[^0-9]','','g')=regexp_replace(v_wait.patient_phone,'[^0-9]','','g')
    order by c.updated_at desc limit 1;
  end if;

  insert into public.waitlist_offers(
    organization_id,waitlist_id,service_id,location_id,resource_id,starts_at,ends_at,expires_at
  ) values (
    p_organization_id,v_wait.id,p_service_id,p_location_id,p_resource_id,p_starts_at,p_ends_at,v_expires
  ) returning id into v_offer_id;

  update public.appointment_waitlist
  set status='offered',offer_expires_at=v_expires,updated_at=now()
  where id=v_wait.id;

  if v_conversation.id is not null then
    v_body := format(
      'Hello %s, an appointment slot is now available on %s. Reply ACCEPT within %s minutes to confirm it, or DECLINE to pass it to the next patient.',
      coalesce(v_wait.patient_name,'there'),
      to_char(p_starts_at at time zone 'Asia/Kolkata','Dy, DD Mon at HH12:MI AM'),
      v_minutes
    );
    insert into public.messages(
      organization_id,conversation_id,organization_address,contact_address,service,direction,content,status,"timestamp"
    ) values (
      p_organization_id,v_conversation.id,v_conversation.organization_address,v_conversation.contact_address,
      'whatsapp','outgoing',jsonb_build_object('version','1','type','text','kind','text','text',v_body),
      jsonb_build_object('status','queued','source','waitlist_recovery'),now()
    ) returning id into v_message_id;
    update public.waitlist_offers set message_id=v_message_id where id=v_offer_id;
  end if;
  return v_offer_id;
end;
$$;

create or replace function private.offer_released_appointment_slot()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.starts_at > now()
    and old.status in ('pending','payment_pending','confirmed')
    and (
      new.status not in ('pending','payment_pending','confirmed')
      or new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.resource_id is distinct from old.resource_id
      or new.location_id is distinct from old.location_id
      or new.service_id is distinct from old.service_id
    )
  then
    perform private.queue_waitlist_offer(old.organization_id,old.service_id,old.location_id,old.resource_id,old.starts_at,old.ends_at);
  end if;
  return new;
end;
$$;

drop trigger if exists offer_released_appointment_slot on public.appointments;
create trigger offer_released_appointment_slot
after update of status,starts_at,ends_at,resource_id,location_id,service_id on public.appointments
for each row execute function private.offer_released_appointment_slot();

create or replace function private.respond_waitlist_offer(
  p_organization_id uuid,
  p_patient_phone text,
  p_action text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_offer public.waitlist_offers%rowtype;
  v_wait public.appointment_waitlist%rowtype;
  v_slug text;
  v_booking jsonb;
begin
  if lower(p_action) not in ('accept','decline') then return jsonb_build_object('handled',false); end if;
  select o.* into v_offer
  from public.waitlist_offers o
  join public.appointment_waitlist w on w.id=o.waitlist_id
  where o.organization_id=p_organization_id and o.status='pending'
    and regexp_replace(w.patient_phone,'[^0-9]','','g')=regexp_replace(p_patient_phone,'[^0-9]','','g')
  order by o.created_at desc for update of o skip locked limit 1;
  if v_offer.id is null then
    return jsonb_build_object('handled',true,'reply','There is no active waitlist offer for this number. Reply MENU to view booking options.');
  end if;
  select * into v_wait from public.appointment_waitlist where id=v_offer.waitlist_id for update;

  if v_offer.expires_at <= now() then
    update public.waitlist_offers set status='expired',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_wait.id;
    perform private.queue_waitlist_offer(v_offer.organization_id,v_offer.service_id,v_offer.location_id,v_offer.resource_id,v_offer.starts_at,v_offer.ends_at);
    return jsonb_build_object('handled',true,'reply','That waitlist offer has expired and was passed to the next patient. Reply MENU to start a new booking.');
  end if;

  if lower(p_action)='decline' then
    update public.waitlist_offers set status='declined',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='cancelled',offer_expires_at=null,updated_at=now() where id=v_wait.id;
    perform private.queue_waitlist_offer(v_offer.organization_id,v_offer.service_id,v_offer.location_id,v_offer.resource_id,v_offer.starts_at,v_offer.ends_at);
    return jsonb_build_object('handled',true,'reply','Thank you. The slot was released to the next patient. Reply MENU if you want to make another booking.');
  end if;

  if exists (
    select 1 from public.appointments a where a.organization_id=v_offer.organization_id
      and a.resource_id=v_offer.resource_id and a.status in ('pending','payment_pending','confirmed')
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(v_offer.starts_at,v_offer.ends_at,'[)')
  ) then
    update public.waitlist_offers set status='revoked',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_wait.id;
    return jsonb_build_object('handled',true,'reply','That slot has just been taken. Your clinic team can help you find another available time.');
  end if;

  select b.slug into v_slug from public.booking_pages b
  where b.organization_id=v_offer.organization_id and b.active=true limit 1;
  v_booking := public.create_public_appointment_v2(
    v_slug,v_offer.resource_id,v_offer.location_id,v_offer.service_id,
    v_wait.patient_name,v_wait.patient_phone,'',v_offer.starts_at,
    'Accepted automated waitlist offer',jsonb_build_object('care_communications_consent',true,'marketing_consent',false)
  );
  update public.waitlist_offers set status='accepted',appointment_id=(v_booking->>'appointment_id')::uuid,responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.appointment_waitlist set status='booked',offer_expires_at=null,updated_at=now() where id=v_wait.id;
  update public.whatsapp_booking_requests set status='confirmed',appointment_id=(v_booking->>'appointment_id')::uuid,decided_at=now(),decision_note='Accepted automated waitlist offer',updated_at=now() where id=v_wait.booking_request_id;
  return jsonb_build_object('handled',true,'accepted',true,'appointment_id',v_booking->>'appointment_id','reply',format('Appointment confirmed. Reference: %s. Reply MENU for booking options.',v_booking->>'booking_reference'));
exception when exclusion_violation or unique_violation then
  update public.waitlist_offers set status='revoked',responded_at=now(),updated_at=now() where id=v_offer.id;
  update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_wait.id;
  return jsonb_build_object('handled',true,'reply','That slot has just been taken. Please reply MENU to choose another available time.');
end;
$$;

revoke all on function private.respond_waitlist_offer(uuid,text,text) from public,anon,authenticated;
grant execute on function private.respond_waitlist_offer(uuid,text,text) to service_role;

create or replace function public.respond_waitlist_offer(
  p_organization_id uuid,
  p_patient_phone text,
  p_action text
) returns jsonb
language sql security definer set search_path=''
as $$
  select private.respond_waitlist_offer(p_organization_id,p_patient_phone,p_action);
$$;
revoke all on function public.respond_waitlist_offer(uuid,text,text) from public,anon,authenticated;
grant execute on function public.respond_waitlist_offer(uuid,text,text) to service_role;

create or replace function private.expire_waitlist_offers()
returns integer language plpgsql security definer set search_path=''
as $$
declare
  v_offer public.waitlist_offers%rowtype;
  v_count integer := 0;
begin
  for v_offer in
    select * from public.waitlist_offers
    where status='pending' and expires_at<=now()
    order by expires_at for update skip locked
  loop
    update public.waitlist_offers set status='expired',responded_at=now(),updated_at=now() where id=v_offer.id;
    update public.appointment_waitlist set status='expired',offer_expires_at=null,updated_at=now() where id=v_offer.waitlist_id;
    perform private.queue_waitlist_offer(v_offer.organization_id,v_offer.service_id,v_offer.location_id,v_offer.resource_id,v_offer.starts_at,v_offer.ends_at);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.expire_waitlist_offers() from public,anon,authenticated;
grant execute on function private.expire_waitlist_offers() to service_role;

select cron.unschedule(jobid) from cron.job where jobname='omnirelay-expire-waitlist-offers';
select cron.schedule('omnirelay-expire-waitlist-offers','* * * * *','select private.expire_waitlist_offers();');
