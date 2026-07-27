-- ─────────────────────────────────────────────────────
--  PICKABOTS — atomic parimutuel payout
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--  Prereq: 0005_votes_table.sql (votes) + 0002_pickabots_live.sql (users).
--
--  Replaces rewardWinners()'s old loop — which, per winner, did a votes.payout
--  update, then a read of users.tokens, then a write of tokens back — with ONE
--  transaction that applies every payout at the same instant. Two benefits:
--
--   1. Everyone is paid out all at once. The old loop trickled credits in one
--      user at a time (and, for a large match, could take many seconds); the
--      leaderboard saw a rolling half-updated state. Now all balances move
--      together on a single commit.
--   2. No lost updates. The old read-then-write of users.tokens could clobber a
--      token change from a concurrent vote on another match. `tokens = tokens +
--      payout` is an atomic increment, so it can't.
--
--  The payout MATH is unchanged — resolveRound() in src/lib/vote-pool.ts stays
--  the single source of truth; this function only writes the amounts it's given.
--
--  p_payouts: [{ "vote_id": uuid, "user_id": text, "payout": numeric }, ...]
--  with one entry per vote on the match (0 for a losing vote, the parimutuel
--  share for a winner, the stake back on a full refund).
-- ─────────────────────────────────────────────────────

create or replace function public.apply_payouts(p_payouts jsonb)
returns void
language plpgsql
as $$
begin
  -- Record every vote's payout (including 0 for losers) so the coin ledger can
  -- read gain/loss straight off votes.payout.
  update public.votes v
     set payout = p.payout
    from jsonb_to_recordset(p_payouts) as p(vote_id uuid, user_id text, payout numeric)
   where v.id = p.vote_id;

  -- Credit anyone who gained. tokens is integer; adding the numeric payout and
  -- storing it rounds exactly as the previous per-user update did, so amounts
  -- are unchanged. Grouped by user for safety, though the votes unique
  -- (user_id, match_id) constraint already means one payout per user per match.
  update public.users u
     set tokens = tokens + p.payout
    from (
      select user_id, sum(payout) as payout
        from jsonb_to_recordset(p_payouts) as x(vote_id uuid, user_id text, payout numeric)
       where payout > 0
       group by user_id
    ) as p
   where u.id = p.user_id;
end;
$$;
