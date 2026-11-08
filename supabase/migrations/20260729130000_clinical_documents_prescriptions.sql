create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  encounter_id uuid references public.patient_encounters(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  prescription_number text not null,
  issued_at timestamptz not null default now(),
  status text not null default 'issued' check (status in ('draft','issued','void')),
  diagnosis text,
  advice text,
  tests_requested text,
  follow_up_at timestamptz,
  version integer not null default 1 check (version > 0),
  supersedes_id uuid references public.prescriptions(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, prescription_number)
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medicine_name text not null,
  dosage text,
  frequency text not null,
  duration text,
  instructions text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  encounter_id uuid references public.patient_encounters(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  document_type text not null default 'report'
    check (document_type in ('prescription','lab_report','imaging','referral','consent','other')),
  title text not null,
  storage_bucket text not null default 'clinical-documents',
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index prescriptions_org_patient_issued_idx
  on public.prescriptions (organization_id, patient_id, issued_at desc);
create index prescription_items_prescription_order_idx
  on public.prescription_items (prescription_id, sort_order);
create index patient_documents_org_patient_created_idx
  on public.patient_documents (organization_id, patient_id, created_at desc);

alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.patient_documents enable row level security;

grant select, insert on public.prescriptions to authenticated;
grant select, insert on public.prescription_items to authenticated;
grant select, insert, delete on public.patient_documents to authenticated;

create policy "members read prescriptions"
on public.prescriptions for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins issue prescriptions"
on public.prescriptions for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and created_by = auth.uid()
);

create policy "members read prescription items"
on public.prescription_items for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins add prescription items"
on public.prescription_items for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and p.organization_id = prescription_items.organization_id
      and p.created_by = auth.uid()
  )
);

create policy "members read patient documents"
on public.patient_documents for select to authenticated
using (private.is_organization_member(organization_id, 'member'));

create policy "admins add patient documents"
on public.patient_documents for insert to authenticated
with check (
  private.is_organization_member(organization_id, 'admin')
  and uploaded_by = auth.uid()
);

create policy "owners delete patient documents"
on public.patient_documents for delete to authenticated
using (private.is_organization_member(organization_id, 'owner'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-documents',
  'clinical-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "members read clinical files"
on storage.objects for select to authenticated
using (
  bucket_id = 'clinical-documents'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_organization_member(((storage.foldername(name))[1])::uuid, 'member')
    else false
  end
);

create policy "admins upload clinical files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'clinical-documents'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_organization_member(((storage.foldername(name))[1])::uuid, 'admin')
    else false
  end
);

create policy "owners delete clinical files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'clinical-documents'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_organization_member(((storage.foldername(name))[1])::uuid, 'owner')
    else false
  end
);
