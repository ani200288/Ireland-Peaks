-- Add private climb dates and ensure API roles have table privileges.
-- Run in Supabase SQL Editor. Safe to rerun.

create table if not exists public.climb_dates (
  user_id uuid not null references auth.users(id) on delete cascade,
  peak_name text not null,
  climbed_on date not null,
  updated_at timestamptz not null default now(),
  constraint climb_dates_user_peak_unique unique (user_id, peak_name)
);

alter table public.climb_dates enable row level security;
drop policy if exists "Users manage their own climb dates" on public.climb_dates;
create policy "Users manage their own climb dates"
  on public.climb_dates for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.climb_dates to authenticated;
