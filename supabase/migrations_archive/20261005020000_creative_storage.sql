-- Insert a new storage bucket for creative assets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-assets',
  'creative-assets',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
) on conflict (id) do nothing;

-- Set up RLS for the storage bucket
create policy "Public Access to Creative Assets"
  on storage.objects for select
  using (bucket_id = 'creative-assets');

create policy "Authenticated users can upload creative assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'creative-assets');

create policy "Users can update their own creative assets"
  on storage.objects for update to authenticated
  using (bucket_id = 'creative-assets' and auth.uid() = owner);

create policy "Users can delete their own creative assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'creative-assets' and auth.uid() = owner);
