-- ─────────────────────────────────────────────────────
--  PICKABOTS — "beg for tokens" skill-check feature
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--
--  Broke players (tokens < threshold) can play a dial skill-check to top up,
--  capped by a ceiling, rate-limited by completed matches, and hard-limited to
--  a lifetime max number of begs. All enforcement is server-side; these two
--  columns are the per-player state that enables it.
-- ─────────────────────────────────────────────────────

-- How many times this player has successfully begged (lifetime cap).
alter table public.users
  add column if not exists beg_count integer not null default 0;

-- The completed-match count at the moment of their last beg — used to enforce
-- the "N matches must pass between begs" cooldown.
alter table public.users
  add column if not exists last_beg_match_count integer;
