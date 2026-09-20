alter table public.patient_profiles drop constraint if exists patient_profiles_check;
alter table public.patient_profiles add constraint patient_profiles_contact_check
  check (phone is not null or email is not null or primary_contact_phone is not null);
