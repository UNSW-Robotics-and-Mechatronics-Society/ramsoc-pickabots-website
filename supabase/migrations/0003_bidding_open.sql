-- ============================================================================
-- 0003_bidding_open.sql
-- Adds a per-match "bidding open" flag, decoupled from is_active, so an admin
-- can open/close bidding on a live match independently of it being on the ring.
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

-- Bracket side (source of truth the admin edits; reconciled into public.matches).
alter table public.bracket_matches
  add column if not exists bidding_open boolean not null default true;

-- Public betting side (what the bets API + public page read).
alter table public.matches
  add column if not exists bidding_open boolean not null default true;

-- Enable Supabase Realtime on public.matches so the public page live-updates
-- when bidding is opened/closed (and on score/status changes). Guarded so
-- re-running is safe. Requires the default `supabase_realtime` publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;
