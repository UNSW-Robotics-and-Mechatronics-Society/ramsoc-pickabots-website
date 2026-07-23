-- ============================================================================
-- 0007_special_teams.sql
-- One-time / exhibition teams added directly by a pickabots admin — kept in
-- a table local to this project (NOT the shared public.teams table, which is
-- owned by the separate ramsoc-sumobots-website repo and carries
-- registration-specific columns like join_code/paid/competition_year that
-- don't apply here). Never referenced by bracket_matches/bracket_config —
-- that's what keeps them out of the bracket, by construction rather than by
-- a category filter.
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

create table if not exists public.special_teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null default '',
  phone      text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);

-- Admin-only data, read/written exclusively via the service-role key server
-- side — no public policy needed (same as `users`).
alter table public.special_teams enable row level security;
