-- ─────────────────────────────────────────────────────
--  Fix: "new row for relation "votes" violates check constraint
--  "bets_amount_check"" when placing a vote.
--
--  public.votes carries a hard `amount <= 50` check constraint (inherited,
--  under the name bets_amount_check, from when this table was the original
--  public.bets before the betting -> voting rename — see 0005_votes_table.sql).
--  That fixed cap made sense only while every user's starting balance was
--  exactly 100 (50% of 100 = 50). Balances can now exceed 100 (admin token
--  boosts, match refunds, rewards), and place_vote already enforces the real,
--  dynamic cap — amount <= floor(tokens * 0.5) — via its EXCEEDS_MAX check.
--  So for any user with > 100 tokens, a vote within their actual 50% cap can
--  still be rejected by this stale fixed constraint, surfacing as a raw,
--  unmapped Postgres error instead of a clean API error.
--
--  Fix: drop the stale fixed cap; keep only the sanity floor (amount >= 1).
--  The dynamic 50%-of-balance cap in place_vote is the real limit.
-- ─────────────────────────────────────────────────────

alter table public.votes drop constraint if exists bets_amount_check;
alter table public.votes drop constraint if exists votes_amount_check;
alter table public.votes add constraint votes_amount_check check (amount >= 1);
