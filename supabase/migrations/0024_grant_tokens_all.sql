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
-- Returns the number of player rows actually adjusted, which the admin UI
-- reports back. For a positive grant that's every player; for a negative one it
-- excludes anyone already sitting at 0, who has nothing left to take.
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
  -- Bail on null/zero before the update. Zero is a no-op anyway, and null is a
  -- live foot-gun: greatest() IGNORES nulls, so `greatest(0, tokens + null)`
  -- is 0, not null — the update would silently zero every balance instead of
  -- doing nothing. The API route already rejects a non-number, so this guards
  -- the hand-run-in-the-SQL-editor case.
  if p_amount is null or p_amount = 0 then
    return 0;
  end if;

  -- The WHERE clause is REQUIRED, not decoration: Supabase preloads
  -- pg_safeupdate for the API roles, so a bare `update ... set` — even inside a
  -- function — fails with "UPDATE requires a WHERE clause". (Same reason
  -- resetTokensOnly() in src/lib/db/resetAll.ts carries .not("id","is",null).)
  --
  -- It's written as "only rows whose balance would actually change" rather than
  -- the usual `id is not null` because a NOT NULL primary key makes that check
  -- redundant, and a planner that folds a redundant qual away leaves the
  -- statement quals-empty and back to erroring. This predicate references the
  -- column AND the parameter, so it can never be optimised out — and it skips
  -- no-op writes, which keeps the returned count honest.
  update public.users
     set tokens = greatest(0, tokens + p_amount)
   where tokens <> greatest(0, tokens + p_amount);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
