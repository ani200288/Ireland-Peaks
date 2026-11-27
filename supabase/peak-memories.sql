-- Private peak notes and photos for PeakLog Ireland.
-- Run this once in Supabase Dashboard > SQL Editor before using the feature.
-- The Storage bucket is private; all records/files are restricted to their owner.

create table if not exists public.peak_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  peak_name text not null,
  notes text not null default '' check (char_length(notes) <= 2000),
  photo_paths text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint peak_memories_user_peak_unique unique (user_id, peak_name),
  constraint peak_memories_photo_limit check (cardinality(photo_paths) <= 5)
);

alter table public.peak_memories enable row level security;

drop policy if exists "Users can read their own peak memories" on public.peak_memories;
create policy "Users can read their own peak memories"
  on public.peak_memories for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own peak memories" on public.peak_memories;
create policy "Users can insert their own peak memories"
  on public.peak_memories for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own peak memories" on public.peak_memories;
create policy "Users can update their own peak memories"
  on public.peak_memories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own peak memories" on public.peak_memories;
create policy "Users can delete their own peak memories"
  on public.peak_memories for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('peak-photos', 'peak-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users can view their own peak photos" on storage.objects;
create policy "Users can view their own peak photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'peak-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can upload their own peak photos" on storage.objects;
create policy "Users can upload their own peak photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'peak-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete their own peak photos" on storage.objects;
create policy "Users can delete their own peak photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'peak-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
