alter table public.patient_profiles
  add column if not exists avatar_storage_path text,
  add column if not exists avatar_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-avatars',
  'patient-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read patient avatars" on storage.objects;
create policy "members read patient avatars"
on storage.objects for select to authenticated
using (
  bucket_id = 'patient-avatars'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid, 'member')
);

drop policy if exists "admins create patient avatars" on storage.objects;
create policy "admins create patient avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'patient-avatars'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid, 'admin')
);

drop policy if exists "admins update patient avatars" on storage.objects;
create policy "admins update patient avatars"
on storage.objects for update to authenticated
using (
  bucket_id = 'patient-avatars'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid, 'admin')
)
with check (
  bucket_id = 'patient-avatars'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid, 'admin')
);

drop policy if exists "admins delete patient avatars" on storage.objects;
create policy "admins delete patient avatars"
on storage.objects for delete to authenticated
using (
  bucket_id = 'patient-avatars'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and private.is_organization_member(((storage.foldername(name))[1])::uuid, 'admin')
);
