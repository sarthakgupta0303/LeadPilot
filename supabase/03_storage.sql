-- ============ 1. Create the two buckets ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kb-documents', 'kb-documents', false, 26214400,   -- 25 MB
     array['application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('avatars',      'avatars',      true,  2097152,    -- 2 MB
     array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']);

-- ============ 2. kb-documents: only admins of the company in the folder name ============
create policy "admins read kb documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'kb-documents'
         and (storage.foldername(name))[1] in
             (select company_id::text from public.company_admins where user_id = (select auth.uid())));
create policy "admins upload kb documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kb-documents'
         and (storage.foldername(name))[1] in
             (select company_id::text from public.company_admins where user_id = (select auth.uid())));
create policy "admins delete kb documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kb-documents'
         and (storage.foldername(name))[1] in
             (select company_id::text from public.company_admins where user_id = (select auth.uid())));

-- ============ 3. avatars: anyone can view (public bucket), only admins can change ============
create policy "admins upload avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
         and (storage.foldername(name))[1] in
             (select company_id::text from public.company_admins where user_id = (select auth.uid())));
create policy "admins update avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] in
             (select company_id::text from public.company_admins where user_id = (select auth.uid())));
create policy "admins delete avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] in
             (select company_id::text from public.company_admins where user_id = (select auth.uid())));
