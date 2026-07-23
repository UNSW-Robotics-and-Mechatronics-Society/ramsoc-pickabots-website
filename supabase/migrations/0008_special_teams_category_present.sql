-- ============================================================================
-- 0008_special_teams_category_present.sql
-- Adds a category tag (std/open/boss/other — purely descriptive, unlike the
-- bracket's division; special teams never enter the bracket regardless of
-- this value) and a present/absent flag to public.special_teams, matching
-- the fields already tracked for regular teams (division badge, present).
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

alter table public.special_teams
  add column if not exists category text not null default 'other'
    check (category in ('std', 'open', 'boss', 'other'));

alter table public.special_teams
  add column if not exists present boolean not null default false;
