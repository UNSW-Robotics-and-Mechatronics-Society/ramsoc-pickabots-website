-- ============================================================================
-- 0009_matches_is_exhibition.sql
-- Adds an explicit is_exhibition flag to the public voting-mirror `matches`
-- table, set by reconcileVotingMatches() from the bracket match's own
-- side === 'exhibition'. Without this, the client had no reliable way to
-- tell an exhibition match apart from a regular bracket-round one (the only
-- signal was bracket_match_id containing the substring "exhibition", which
-- is fragile string-matching, not a real field) — needed so the public
-- voting page, public match list, and admin matches panel can split
-- exhibition matches into their own tab instead of mixing them into the
-- Standard/Open views.
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

alter table public.matches
  add column if not exists is_exhibition boolean not null default false;
