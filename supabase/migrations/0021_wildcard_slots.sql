-- ============================================================================
-- 0021_wildcard_slots.sql
-- Adds the 'wildcard' bracket side.
--
-- A wildcard is a holding box that sits OUTSIDE the bracket tree: the admin
-- puts a knocked-out team in it, and marking it completed feeds that team into
-- slot B of its matching losers-bracket match at the 8-team stage (see
-- wildcardLbRound in lib/mock-data). Two per division, so that stage reads
-- 6 teams from the original bracket + 2 wildcards.
--
-- Modelled as bracket_matches rows rather than a new table so they persist,
-- load and save through exactly the same path as every other match — only
-- `side` is new, and the existing CHECK constraint has to allow it.
--
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

alter table public.bracket_matches drop constraint if exists bracket_matches_side_check;
alter table public.bracket_matches add constraint bracket_matches_side_check
  check (side in ('winners', 'losers', 'finals-semi', 'finals-final', 'finals-third', 'exhibition', 'wildcard'));
