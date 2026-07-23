-- ============================================================================
-- 0006_public_realtime.sql
-- Extends live updates (currently only public.matches, see 0003) to the rest
-- of the public pages: Bracket, Matches, and Leaderboard poll/refetch once
-- per page load today and never update again without a manual reload.
--
-- Adds public-read policies for the two tables that don't have one yet
-- (bracket_schedule had RLS enabled but no policy at all; votes likewise
-- since 0005 only enabled RLS) — Realtime enforces RLS for the anon key, so
-- without these the browser client can't receive change events for them —
-- then adds bracket_matches, bracket_config, bracket_schedule, and votes to
-- the supabase_realtime publication.
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

drop policy if exists "bracket_schedule_public_read" on public.bracket_schedule;
create policy "bracket_schedule_public_read" on public.bracket_schedule for select using (true);

drop policy if exists "votes_public_read" on public.votes;
create policy "votes_public_read" on public.votes for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bracket_matches'
  ) then
    alter publication supabase_realtime add table public.bracket_matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bracket_config'
  ) then
    alter publication supabase_realtime add table public.bracket_config;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bracket_schedule'
  ) then
    alter publication supabase_realtime add table public.bracket_schedule;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
end $$;
