-- ============================================================================
-- 0017_in_bracket.sql
-- Replaces the old cosmetic `wildcard` flag with an `in_bracket` flag — the
-- toggle an admin uses to decide which teams the "Auto Fill" button pulls
-- into the bracket.
--
-- Regular teams (pickabots_team_state): tri-state, NULLABLE.
--   NULL  = auto  → in-bracket iff the team has a seed
--   true  = explicitly in the bracket (even without a seed)
--   false = explicitly out (kept its seed, but Auto Fill skips it)
-- The column is renamed from `wildcard` (which was purely a display tint and
-- fed nothing) and its values reset to NULL, since the meaning has changed
-- entirely — every team starts on "auto" (seeded → in, unseeded → out).
--
-- Special teams (special_teams): a plain boolean, default off. They have no
-- seed, so there is no auto-on; the admin turns it on explicitly. (Auto Fill
-- does not yet route special teams into a division bracket — this flag is a
-- marker for now.)
--
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

alter table public.pickabots_team_state rename column wildcard to in_bracket;
alter table public.pickabots_team_state alter column in_bracket drop not null;
alter table public.pickabots_team_state alter column in_bracket drop default;
update public.pickabots_team_state set in_bracket = null;

alter table public.special_teams
  add column if not exists in_bracket boolean not null default false;
