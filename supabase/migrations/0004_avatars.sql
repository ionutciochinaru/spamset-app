-- Profile pictures on the leaderboards. Additive only.
-- The app resizes a picture to a 256 px JPEG and uploads it to the public "avatars" bucket as
-- <user id>/<timestamp>.jpg; profiles.avatar_path points at the current one. Anyone can view
-- avatars (they show on public boards); you can only write your own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/jpeg'])
on conflict (id) do nothing;

create policy "Read your avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Upload your avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Replace your avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Delete your avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.profiles
  add column avatar_path text
  check (avatar_path is null or avatar_path ~ ('^' || user_id::text || '/[0-9]+\.jpg$'));

notify pgrst, 'reload schema';
