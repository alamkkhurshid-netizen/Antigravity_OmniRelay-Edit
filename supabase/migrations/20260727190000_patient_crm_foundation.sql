create table public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  age smallint check (age between 0 and 120),
  health_concern text,
  locality text,
  pincode text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  patient_summary text,
  care_communications_consent boolean not null default true,
  marketing_consent boolean not null default false,
  source text not null default 'appointment',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);

create unique index patient_profiles_org_phone_unique
  on public.patient_profiles (
    organization_id,
    (regexp_replace(lower(phone), '[^0-9+]', '', 'g'))
  )
  where phone is not null;

create unique index patient_profiles_org_email_unique
  on public.patient_profiles (organization_id, lower(email))
  where email is not null;

create index patient_profiles_org_last_seen_idx
  on public.patient_profiles (organization_id, last_seen_at desc);

alter table public.patient_profiles enable row level security;
grant select, insert, update, delete on public.patient_profiles to authenticated;

create policy "members read patient profiles"
on public.patient_profiles for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins create patient profiles"
on public.patient_profiles for insert to authenticated
with check (private.is_organization_member(organization_id, 'admin'));

create policy "admins update patient profiles"
on public.patient_profiles for update to authenticated
using (private.is_organization_member(organization_id, 'admin'))
with check (private.is_organization_member(organization_id, 'admin'));

create policy "owners delete patient profiles"
on public.patient_profiles for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

alter table public.appointments
  add column if not exists patient_id uuid references public.patient_profiles(id) on delete set null,
  add column if not exists patient_age smallint check (patient_age between 0 and 120),
  add column if not exists health_concern text,
  add column if not exists patient_locality text,
  add column if not exists patient_pincode text check (patient_pincode is null or patient_pincode ~ '^[0-9]{6}$'),
  add column if not exists patient_summary text,
  add column if not exists care_communications_consent boolean not null default true,
  add column if not exists marketing_consent boolean not null default false;

create index if not exists appointments_patient_start_idx
  on public.appointments (patient_id, starts_at desc);

create or replace function private.sync_patient_from_appointment(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
  v_patient_id uuid;
  normalized_phone text;
begin
  select * into a from public.appointments where id = p_appointment_id;
  if a.id is null then return null; end if;

  normalized_phone := nullif(regexp_replace(lower(coalesce(a.customer_phone, '')), '[^0-9+]', '', 'g'), '');

  select p.id into v_patient_id
  from public.patient_profiles p
  where p.organization_id = a.organization_id
    and (
      (normalized_phone is not null and regexp_replace(lower(coalesce(p.phone, '')), '[^0-9+]', '', 'g') = normalized_phone)
      or
      (a.customer_email is not null and lower(p.email) = lower(a.customer_email))
    )
  order by
    case when normalized_phone is not null and regexp_replace(lower(coalesce(p.phone, '')), '[^0-9+]', '', 'g') = normalized_phone then 0 else 1 end,
    p.created_at
  limit 1;

  if v_patient_id is null then
    insert into public.patient_profiles (
      organization_id, full_name, phone, email, age, health_concern,
      locality, pincode, patient_summary, care_communications_consent,
      marketing_consent, source, first_seen_at, last_seen_at
    ) values (
      a.organization_id, a.customer_name, a.customer_phone, a.customer_email,
      a.patient_age, a.health_concern, a.patient_locality, a.patient_pincode,
      a.patient_summary, a.care_communications_consent, a.marketing_consent,
      a.source, coalesce(a.created_at, now()), greatest(coalesce(a.starts_at, now()), coalesce(a.created_at, now()))
    ) returning id into v_patient_id;
  else
    update public.patient_profiles
    set full_name = a.customer_name,
        phone = coalesce(a.customer_phone, phone),
        email = coalesce(a.customer_email, email),
        age = coalesce(a.patient_age, age),
        health_concern = coalesce(nullif(a.health_concern, ''), health_concern),
        locality = coalesce(nullif(a.patient_locality, ''), locality),
        pincode = coalesce(nullif(a.patient_pincode, ''), pincode),
        patient_summary = coalesce(nullif(a.patient_summary, ''), patient_summary),
        care_communications_consent = a.care_communications_consent,
        marketing_consent = marketing_consent or a.marketing_consent,
        last_seen_at = greatest(last_seen_at, coalesce(a.starts_at, now()), coalesce(a.updated_at, now())),
        updated_at = now()
    where id = v_patient_id;
  end if;

  update public.appointments
  set patient_id = v_patient_id
  where id = a.id and patient_id is distinct from v_patient_id;

  return v_patient_id;
end;
$$;

revoke all on function private.sync_patient_from_appointment(uuid)
from public, anon, authenticated;

create or replace function private.sync_patient_appointment_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_patient_from_appointment(new.id);
  return new;
end;
$$;

revoke all on function private.sync_patient_appointment_trigger()
from public, anon, authenticated;

drop trigger if exists sync_patient_after_appointment on public.appointments;
create trigger sync_patient_after_appointment
after insert or update of customer_name, customer_phone, customer_email,
  patient_age, health_concern, patient_locality, patient_pincode, patient_summary,
  care_communications_consent, marketing_consent
on public.appointments
for each row execute function private.sync_patient_appointment_trigger();

do $$
declare a record;
begin
  for a in select id from public.appointments order by created_at loop
    perform private.sync_patient_from_appointment(a.id);
  end loop;
end
$$;

create or replace function public.create_public_appointment_v2(
  p_slug text,
  p_resource_id uuid,
  p_location_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_starts_at timestamptz,
  p_notes text default null,
  p_intake jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  appointment_id uuid;
  v_age integer;
  v_pincode text;
begin
  v_age := nullif(p_intake->>'age', '')::integer;
  v_pincode := nullif(trim(coalesce(p_intake->>'pincode', '')), '');
  if v_age is not null and (v_age < 0 or v_age > 120) then raise exception 'Enter a valid age'; end if;
  if v_pincode is not null and v_pincode !~ '^[0-9]{6}$' then raise exception 'Enter a valid 6-digit PIN code'; end if;
  if coalesce((p_intake->>'care_communications_consent')::boolean, false) is not true then
    raise exception 'Booking communication consent is required';
  end if;

  result := public.create_public_appointment(
    p_slug, p_resource_id, p_location_id, p_service_id, p_customer_name,
    p_customer_phone, p_customer_email, p_starts_at, p_notes
  );
  appointment_id := (result->>'appointment_id')::uuid;

  update public.appointments
  set patient_age = v_age,
      health_concern = nullif(trim(coalesce(p_intake->>'health_concern', '')), ''),
      patient_locality = nullif(trim(coalesce(p_intake->>'locality', '')), ''),
      patient_pincode = v_pincode,
      patient_summary = nullif(trim(coalesce(p_intake->>'summary', '')), ''),
      care_communications_consent = true,
      marketing_consent = coalesce((p_intake->>'marketing_consent')::boolean, false)
  where id = appointment_id;

  return result;
end;
$$;

revoke all on function public.create_public_appointment_v2(
  text, uuid, uuid, uuid, text, text, text, timestamptz, text, jsonb
) from public;
grant execute on function public.create_public_appointment_v2(
  text, uuid, uuid, uuid, text, text, text, timestamptz, text, jsonb
) to anon, authenticated;

create or replace function public.create_public_payment_intent_v2(
  p_slug text,
  p_resource_id uuid,
  p_location_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_starts_at timestamptz,
  p_notes text default null,
  p_intake jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  appointment_id uuid;
  v_age integer;
  v_pincode text;
begin
  v_age := nullif(p_intake->>'age', '')::integer;
  v_pincode := nullif(trim(coalesce(p_intake->>'pincode', '')), '');
  if v_age is not null and (v_age < 0 or v_age > 120) then raise exception 'Enter a valid age'; end if;
  if v_pincode is not null and v_pincode !~ '^[0-9]{6}$' then raise exception 'Enter a valid 6-digit PIN code'; end if;
  if coalesce((p_intake->>'care_communications_consent')::boolean, false) is not true then
    raise exception 'Booking communication consent is required';
  end if;

  result := public.create_public_payment_intent(
    p_slug, p_resource_id, p_location_id, p_service_id, p_customer_name,
    p_customer_phone, p_customer_email, p_starts_at, p_notes
  );
  appointment_id := (result->>'appointment_id')::uuid;

  update public.appointments
  set patient_age = v_age,
      health_concern = nullif(trim(coalesce(p_intake->>'health_concern', '')), ''),
      patient_locality = nullif(trim(coalesce(p_intake->>'locality', '')), ''),
      patient_pincode = v_pincode,
      patient_summary = nullif(trim(coalesce(p_intake->>'summary', '')), ''),
      care_communications_consent = true,
      marketing_consent = coalesce((p_intake->>'marketing_consent')::boolean, false)
  where id = appointment_id;

  return result;
end;
$$;

revoke all on function public.create_public_payment_intent_v2(
  text, uuid, uuid, uuid, text, text, text, timestamptz, text, jsonb
) from public;
grant execute on function public.create_public_payment_intent_v2(
  text, uuid, uuid, uuid, text, text, text, timestamptz, text, jsonb
) to anon, authenticated;
