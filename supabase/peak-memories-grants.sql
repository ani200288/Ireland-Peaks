-- Add these grants to the peak memories setup to allow the Supabase authenticated API role
-- to access the table. Row-level security policies continue to restrict users to their rows.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.peak_memories to authenticated;
