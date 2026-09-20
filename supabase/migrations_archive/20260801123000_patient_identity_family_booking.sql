alter table public.patient_profiles
  add column if not exists date_of_birth date,
  add column if not exists primary_contact_phone text,
  add column if not exists identity_status text not null default 'unverified'
    check (identity_status in ('unverified','verified','staff_verified'));

update public.patient_profiles
set primary_contact_phone = phone
where primary_contact_phone is null and phone is not null;

create table if not exists public.patient_guardian_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  guardian_name text not null,
  guardian_phone text not null,
  relationship text not null check (relationship in ('self','child','parent','spouse','relative','other')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','otp_verified','staff_verified')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, patient_id, guardian_phone)
);

create index if not exists patient_guardian_links_lookup_idx
  on public.patient_guardian_links (organization_id, regexp_replace(guardian_phone,'[^0-9]','','g'));

alter table public.patient_guardian_links enable row level security;
grant select,insert,update,delete on public.patient_guardian_links to authenticated;

create policy "members read guardian links" on public.patient_guardian_links
for select to authenticated using (private.is_organization_member(organization_id,'member'));
create policy "admins manage guardian links" on public.patient_guardian_links
for all to authenticated using (private.is_organization_member(organization_id,'admin'))
with check (private.is_organization_member(organization_id,'admin'));

alter table public.appointments
  add column if not exists booking_contact_name text,
  add column if not exists booking_contact_phone text,
  add column if not exists patient_relationship text not null default 'self'
    check (patient_relationship in ('self','child','parent','spouse','relative','other')),
  add column if not exists patient_date_of_birth date;

create or replace function private.sync_patient_from_appointment(p_appointment_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  a public.appointments%rowtype; v_patient_id uuid; normalized_patient_phone text; normalized_guardian_phone text;
begin
  select * into a from public.appointments where id=p_appointment_id;
  if a.id is null then return null; end if;
  normalized_patient_phone:=nullif(regexp_replace(lower(coalesce(a.customer_phone,'')),'[^0-9+]','','g'),'');
  normalized_guardian_phone:=nullif(regexp_replace(lower(coalesce(a.booking_contact_phone,a.customer_phone,'')),'[^0-9+]','','g'),'');

  if a.patient_relationship='self' then
    select p.id into v_patient_id from public.patient_profiles p
    where p.organization_id=a.organization_id and (
      (normalized_patient_phone is not null and regexp_replace(lower(coalesce(p.phone,'')),'[^0-9+]','','g')=normalized_patient_phone)
      or (a.customer_email is not null and lower(p.email)=lower(a.customer_email))
    ) order by p.created_at limit 1;
  else
    select p.id into v_patient_id
    from public.patient_guardian_links g join public.patient_profiles p on p.id=g.patient_id
    where g.organization_id=a.organization_id
      and regexp_replace(lower(g.guardian_phone),'[^0-9+]','','g')=normalized_guardian_phone
      and lower(p.full_name)=lower(a.customer_name)
      and (a.patient_date_of_birth is null or p.date_of_birth=a.patient_date_of_birth)
    order by p.created_at limit 1;
  end if;

  if v_patient_id is null then
    insert into public.patient_profiles(organization_id,full_name,phone,email,age,date_of_birth,primary_contact_phone,health_concern,locality,pincode,patient_summary,care_communications_consent,marketing_consent,source,first_seen_at,last_seen_at)
    values(a.organization_id,a.customer_name,case when a.patient_relationship='self' then a.customer_phone end,a.customer_email,a.patient_age,a.patient_date_of_birth,coalesce(a.booking_contact_phone,a.customer_phone),a.health_concern,a.patient_locality,a.patient_pincode,a.patient_summary,a.care_communications_consent,a.marketing_consent,a.source,coalesce(a.created_at,now()),greatest(coalesce(a.starts_at,now()),coalesce(a.created_at,now())))
    returning id into v_patient_id;
  else
    update public.patient_profiles set full_name=a.customer_name,email=coalesce(a.customer_email,email),age=coalesce(a.patient_age,age),date_of_birth=coalesce(a.patient_date_of_birth,date_of_birth),primary_contact_phone=coalesce(a.booking_contact_phone,a.customer_phone,primary_contact_phone),health_concern=coalesce(nullif(a.health_concern,''),health_concern),locality=coalesce(nullif(a.patient_locality,''),locality),pincode=coalesce(nullif(a.patient_pincode,''),pincode),patient_summary=coalesce(nullif(a.patient_summary,''),patient_summary),care_communications_consent=a.care_communications_consent,marketing_consent=marketing_consent or a.marketing_consent,last_seen_at=greatest(last_seen_at,coalesce(a.starts_at,now()),coalesce(a.updated_at,now())),updated_at=now() where id=v_patient_id;
  end if;

  if normalized_guardian_phone is not null then
    insert into public.patient_guardian_links(organization_id,patient_id,guardian_name,guardian_phone,relationship)
    values(a.organization_id,v_patient_id,coalesce(nullif(a.booking_contact_name,''),a.customer_name),coalesce(a.booking_contact_phone,a.customer_phone),a.patient_relationship)
    on conflict(organization_id,patient_id,guardian_phone) do update set guardian_name=excluded.guardian_name,relationship=excluded.relationship,updated_at=now();
  end if;
  update public.appointments set patient_id=v_patient_id where id=a.id and patient_id is distinct from v_patient_id;
  return v_patient_id;
end; $$;

revoke all on function private.sync_patient_from_appointment(uuid) from public,anon,authenticated;

drop trigger if exists sync_patient_after_appointment on public.appointments;
create trigger sync_patient_after_appointment after insert or update of customer_name,customer_phone,customer_email,patient_age,patient_date_of_birth,booking_contact_name,booking_contact_phone,patient_relationship,health_concern,patient_locality,patient_pincode,patient_summary,care_communications_consent,marketing_consent on public.appointments for each row execute function private.sync_patient_appointment_trigger();

comment on table public.patient_guardian_links is 'OTP-ready relationship boundary between a booking contact and one or more patients. Clinical history is never exposed through this table.';

create or replace function public.attach_public_booking_identity(
  p_booking_reference text,
  p_manage_token text,
  p_booking_contact_name text,
  p_booking_contact_phone text,
  p_patient_relationship text,
  p_patient_date_of_birth date default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_appointment_id uuid;
begin
  if p_patient_relationship not in ('self','child','parent','spouse','relative','other') then raise exception 'Choose a valid relationship'; end if;
  if length(trim(coalesce(p_booking_contact_name,'')))<2 then raise exception 'Booking contact name is required'; end if;
  if length(regexp_replace(coalesce(p_booking_contact_phone,''),'[^0-9]','','g'))<10 then raise exception 'Enter a valid booking contact mobile number'; end if;
  select c.appointment_id into v_appointment_id from private.customer_booking_access c
  where c.booking_reference=p_booking_reference
    and c.token_hash=extensions.digest(convert_to(p_manage_token,'UTF8'),'sha256');
  if v_appointment_id is null then raise exception 'Invalid booking access'; end if;
  update public.appointments set booking_contact_name=trim(p_booking_contact_name),booking_contact_phone=trim(p_booking_contact_phone),patient_relationship=p_patient_relationship,patient_date_of_birth=p_patient_date_of_birth where id=v_appointment_id;
end; $$;

revoke all on function public.attach_public_booking_identity(text,text,text,text,text,date) from public;
grant execute on function public.attach_public_booking_identity(text,text,text,text,text,date) to anon,authenticated;
