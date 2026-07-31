-- ─────────────────────────────────────────────────────
--  PICKABOTS — bulk token boost
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--  Prereq: 0002_pickabots_live.sql (users).
--
--  Adds p_amount tokens to EVERY player's balance in one atomic statement
--  (negative amounts deduct). Balances are clamped at 0, same as the
--  per-player boostPlayer() path in src/lib/db/players.ts.
-- ─────────────────────────────────────────────────────

create or replace function public.bulk_boost_tokens(p_amount integer)
returns void
language sql
as $$
  update public.users set tokens = greatest(0, tokens + p_amount);
$$;
