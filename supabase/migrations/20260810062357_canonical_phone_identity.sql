create or replace function private.normalize_phone_identity(p_phone text)
returns text language plpgsql immutable strict set search_path = '' as $$
declare digits text;
begin
  digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if digits = '' then return null; end if;
  if left(digits, 2) = '00' then digits := substr(digits, 3); end if;
  if length(digits) = 11 and left(digits, 1) = '0' then digits := right(digits, 10); end if;
  if length(digits) = 10 then digits := '91' || digits; end if;
  if length(digits) < 8 or length(digits) > 15 then return null; end if;
  return digits;
end;
$$;

revoke all on function private.normalize_phone_identity(text) from public, anon, authenticated;

drop index if exists public.patient_profiles_org_normalized_phone_idx;
drop index if exists public.patient_profiles_org_phone_unique;
alter table public.patient_profiles drop column normalized_phone;
alter table public.patient_profiles add column normalized_phone text
  generated always as (private.normalize_phone_identity(phone)) stored;
create unique index patient_profiles_org_normalized_phone_unique
  on public.patient_profiles (organization_id, normalized_phone)
  where normalized_phone is not null;

alter table public.patient_guardian_links add column normalized_phone text
  generated always as (private.normalize_phone_identity(guardian_phone)) stored;
alter table public.patient_guardian_links
  drop constraint patient_guardian_links_organization_id_patient_id_guardian__key;
alter table public.patient_guardian_links
  add constraint patient_guardian_links_org_patient_normalized_phone_key
  unique (organization_id, patient_id, normalized_phone);

create or replace function private.sync_patient_from_appointment(p_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments%rowtype; v_patient_id uuid;
  normalized_patient_phone text; normalized_guardian_phone text;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if a.id is null then return null; end if;
  normalized_patient_phone := private.normalize_phone_identity(a.customer_phone);
  normalized_guardian_phone := private.normalize_phone_identity(coalesce(a.booking_contact_phone, a.customer_phone));

  if a.patient_relationship = 'self' then
    select p.id into v_patient_id from public.patient_profiles p
    where p.organization_id = a.organization_id and (
      (normalized_patient_phone is not null and p.normalized_phone = normalized_patient_phone)
      or (a.customer_email is not null and lower(p.email) = lower(a.customer_email))
    ) order by p.created_at limit 1;
  else
    select p.id into v_patient_id from public.patient_guardian_links g
    join public.patient_profiles p on p.id = g.patient_id
    where g.organization_id = a.organization_id
      and g.normalized_phone = normalized_guardian_phone
      and lower(p.full_name) = lower(a.customer_name)
      and (a.patient_date_of_birth is null or p.date_of_birth = a.patient_date_of_birth)
    order by p.created_at limit 1;
  end if;

  if v_patient_id is null then
    insert into public.patient_profiles (
      organization_id, full_name, phone, email, age, date_of_birth, primary_contact_phone,
      health_concern, locality, pincode, patient_summary, care_communications_consent,
      marketing_consent, source, first_seen_at, last_seen_at
    ) values (
      a.organization_id, a.customer_name, case when a.patient_relationship = 'self' then a.customer_phone end,
      a.customer_email, a.patient_age, a.patient_date_of_birth, coalesce(a.booking_contact_phone,a.customer_phone),
      a.health_concern, a.patient_locality, a.patient_pincode, a.patient_summary,
      a.care_communications_consent, a.marketing_consent, a.source, coalesce(a.created_at,now()),
      greatest(coalesce(a.starts_at,now()),coalesce(a.created_at,now()))
    ) returning id into v_patient_id;
  else
    update public.patient_profiles set
      full_name=a.customer_name, email=coalesce(a.customer_email,email), age=coalesce(a.patient_age,age),
      date_of_birth=coalesce(a.patient_date_of_birth,date_of_birth),
      primary_contact_phone=coalesce(a.booking_contact_phone,a.customer_phone,primary_contact_phone),
      health_concern=coalesce(nullif(a.health_concern,''),health_concern),
      locality=coalesce(nullif(a.patient_locality,''),locality), pincode=coalesce(nullif(a.patient_pincode,''),pincode),
      patient_summary=coalesce(nullif(a.patient_summary,''),patient_summary),
      care_communications_consent=a.care_communications_consent,
      marketing_consent=marketing_consent or a.marketing_consent,
      last_seen_at=greatest(last_seen_at,coalesce(a.starts_at,now()),coalesce(a.updated_at,now())),updated_at=now()
    where id=v_patient_id;
  end if;

  if normalized_guardian_phone is not null then
    insert into public.patient_guardian_links(organization_id,patient_id,guardian_name,guardian_phone,relationship)
    values(a.organization_id,v_patient_id,coalesce(nullif(a.booking_contact_name,''),a.customer_name),
      coalesce(a.booking_contact_phone,a.customer_phone),a.patient_relationship)
    on conflict (organization_id,patient_id,normalized_phone) do update set
      guardian_name=excluded.guardian_name,guardian_phone=excluded.guardian_phone,
      relationship=excluded.relationship,updated_at=now();
  end if;
  update public.appointments set patient_id=v_patient_id where id=a.id and patient_id is distinct from v_patient_id;
  return v_patient_id;
end;
$$;
