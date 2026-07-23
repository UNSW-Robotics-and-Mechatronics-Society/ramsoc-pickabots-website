-- ─────────────────────────────────────────────────────
--  PICKABOTS — race-safe voting (single transactional functions)
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--
--  Replaces the app's multi-step read-then-write vote flow (which could lose a
--  token deduction or allow a double-vote when the same user submits twice at
--  once) with ONE transaction per action. Row locks (SELECT ... FOR UPDATE and
--  the conditional UPDATE) serialize concurrent submissions from the same user;
--  everything (token balance, vote row, match pools) commits together or rolls
--  back together.
--
--  Prereq: the live `votes` table has columns (user_id text, match_id uuid,
--  side text, amount int). This migration also adds the uniqueness + index that
--  the bets→votes rename may have dropped — verify they applied cleanly.
-- ─────────────────────────────────────────────────────

-- One vote per user per match (hard guarantee, not an app-level check), and a
-- fast lookup index for the hot standings/reward/leaderboard reads.
create unique index if not exists votes_user_match_uniq on public.votes (user_id, match_id);
create index        if not exists votes_match_idx       on public.votes (match_id);

-- ── place_vote ────────────────────────────────────────────────────────────────
-- Returns the voter's NEW token balance, or raises a coded exception the API
-- maps to an HTTP status. The whole body is one transaction.
create or replace function public.place_vote(
  p_user_id  text,
  p_match_id uuid,
  p_side     text,
  p_amount   integer
) returns jsonb
language plpgsql
as $$
declare
  v_active      boolean;
  v_voting_open boolean;
  v_tokens      integer;
  v_vote_id     uuid;
begin
  if p_amount is null or p_amount < 1 then raise exception 'BAD_AMOUNT'; end if;
  if p_side not in ('left','right')  then raise exception 'BAD_SIDE';   end if;

  -- Lock the match row; confirm it's live and open.
  select is_active, voting_open into v_active, v_voting_open
    from public.matches where id = p_match_id for update;
  if not found            then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_active is not true  then raise exception 'MATCH_INACTIVE';  end if;
  if v_voting_open is false then raise exception 'VOTING_CLOSED';  end if;

  -- Lock the user row; enforce balance + the 50%-of-balance cap.
  select tokens into v_tokens from public.users where id = p_user_id for update;
  if not found            then raise exception 'NO_USER';            end if;
  if v_tokens < p_amount   then raise exception 'INSUFFICIENT_TOKENS'; end if;
  if p_amount > floor(v_tokens * 0.5) then raise exception 'EXCEEDS_MAX'; end if;

  -- Deduct, record the vote (unique index guards double-vote), update pools.
  update public.users set tokens = tokens - p_amount where id = p_user_id;

  insert into public.votes (user_id, match_id, side, amount)
    values (p_user_id, p_match_id, p_side, p_amount)
    returning id into v_vote_id;

  update public.matches set
    pool_left   = pool_left   + case when p_side = 'left'  then p_amount else 0 end,
    pool_right  = pool_right  + case when p_side = 'right' then p_amount else 0 end,
    votes_left  = votes_left  + case when p_side = 'left'  then 1 else 0 end,
    votes_right = votes_right + case when p_side = 'right' then 1 else 0 end
  where id = p_match_id;

  return jsonb_build_object('tokens', v_tokens - p_amount, 'vote_id', v_vote_id);
exception
  when unique_violation then raise exception 'ALREADY_VOTED';
end;
$$;

-- ── undo_vote ─────────────────────────────────────────────────────────────────
-- Deletes the caller's vote (only while the match is live + voting open),
-- refunds the tokens, and reverses the pools — all atomically. Returns the new
-- balance.
create or replace function public.undo_vote(
  p_user_id text,
  p_vote_id uuid
) returns integer
language plpgsql
as $$
declare
  v_match_id uuid;
  v_side     text;
  v_amount   integer;
  v_active   boolean;
  v_open     boolean;
  v_winner   text;
  v_tokens   integer;
begin
  -- Lock + fetch the vote (must belong to the caller).
  select match_id, side, amount into v_match_id, v_side, v_amount
    from public.votes where id = p_vote_id and user_id = p_user_id for update;
  if not found then raise exception 'VOTE_NOT_FOUND'; end if;

  select is_active, voting_open, winner_side into v_active, v_open, v_winner
    from public.matches where id = v_match_id for update;
  if v_active is not true or v_winner is not null then raise exception 'MATCH_RESOLVED'; end if;
  if v_open is false then raise exception 'VOTING_CLOSED'; end if;

  delete from public.votes where id = p_vote_id;

  update public.users set tokens = tokens + v_amount where id = p_user_id
    returning tokens into v_tokens;

  update public.matches set
    pool_left   = greatest(0, pool_left   - case when v_side = 'left'  then v_amount else 0 end),
    pool_right  = greatest(0, pool_right  - case when v_side = 'right' then v_amount else 0 end),
    votes_left  = greatest(0, votes_left  - case when v_side = 'left'  then 1 else 0 end),
    votes_right = greatest(0, votes_right - case when v_side = 'right' then 1 else 0 end)
  where id = v_match_id;

  return v_tokens;
end;
$$;
