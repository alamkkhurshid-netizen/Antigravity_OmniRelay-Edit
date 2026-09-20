-- Create a public bucket for retail catalog images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'retail_catalog', 
  'retail_catalog', 
  true, 
  5242880, -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Set up RLS for the storage bucket
create policy "anyone can view retail catalog images" 
  on storage.objects for select 
  to public 
  using ( bucket_id = 'retail_catalog' );

create policy "authenticated members can upload retail catalog images" 
  on storage.objects for insert 
  to authenticated 
  with check ( 
    bucket_id = 'retail_catalog' 
    and (storage.foldername(name))[1] = (select organization_id::text from public.onboarding_profiles where id = auth.uid() limit 1)
  );

create policy "authenticated members can update retail catalog images" 
  on storage.objects for update 
  to authenticated 
  using ( 
    bucket_id = 'retail_catalog' 
    and (storage.foldername(name))[1] = (select organization_id::text from public.onboarding_profiles where id = auth.uid() limit 1)
  );

create policy "authenticated members can delete retail catalog images" 
  on storage.objects for delete 
  to authenticated 
  using ( 
    bucket_id = 'retail_catalog' 
    and (storage.foldername(name))[1] = (select organization_id::text from public.onboarding_profiles where id = auth.uid() limit 1)
  );
