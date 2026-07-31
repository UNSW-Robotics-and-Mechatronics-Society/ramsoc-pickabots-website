-- ============================================================================
-- 0024_grant_tokens_all.sql
-- Admin "give every player N RamCoin" (Settings → Player Settings).
--
-- Why an RPC instead of doing this in app code: the supabase-js client can't
-- express `tokens = tokens + N`, so a TS implementation would have to read every
-- balance and write it back — the exact read-then-write race 0018 removed from
-- the payout path. Mid-event, a player voting between that read and write would
-- have their stake silently refunded (or their payout erased) by the grant.
-- One statement, one atomic increment, no lost updates.
--
-- Distinct from the existing reset (users.tokens = 100, a flat overwrite): this
-- is relative, so it tops everyone up without flattening the standings the
-- leaderboard is built on.
--
-- p_amount: RamCoin to add to EVERY player. Negative deducts; balances floor at
-- 0 rather than going into debt (same clamp as boostPlayer's single-player path
-- in src/lib/db/players.ts).
--
-- Returns the number of player rows adjusted, which the admin UI reports back.
--
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

create or replace function public.grant_tokens_all(p_amount integer)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.users
     set tokens = greatest(0, tokens + p_amount);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
