-- ============================================================================
-- 0004_exhibition_matches.sql
-- Allow the ad-hoc 'exhibition' match side — extra/filler matches the admin
-- inserts at the top of a ring's schedule (not part of the bracket tree).
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

alter table public.bracket_matches drop constraint if exists bracket_matches_side_check;
alter table public.bracket_matches add constraint bracket_matches_side_check
  check (side in ('winners', 'losers', 'finals-semi', 'finals-final', 'finals-third', 'exhibition'));
