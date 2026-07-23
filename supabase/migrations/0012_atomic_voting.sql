-- ─────────────────────────────────────────────────────
--  PICKABOTS — race-safe voting (single transactional functions)
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--  Prereq: run 0005_votes_table.sql first (creates public.votes).
--
--  Replaces the app's multi-step read-then-write vote flow (which could lose a
--  token deduction or allow a double-vote when the same user submits twice at
--  once) with ONE transaction per action. Row locks (SELECT ... FOR UPDATE and
--  the conditional UPDATE) serialize concurrent submissions from the same user;
--  the token balance and the vote row commit together or roll back together.
--
--  Odds are derived from the votes table directly (see the public-realtime
--  setup in 0006), so these functions do NOT maintain any denormalized pools.
-- ─────────────────────────────────────────────────────

-- Fast lookup index for the hot standings/reward/leaderboard reads by match.
-- (Uniqueness of (user_id, match_id) is already enforced by the votes table.)
create index if not exists votes_match_idx on public.votes (match_id);

-- ── place_vote ────────────────────────────────────────────────────────────────
-- Returns { tokens, vote_id }, or raises a coded exception the API maps to an
-- HTTP status. The whole body is one transaction.
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

  -- Deduct and record the vote (the unique constraint guards double-vote).
  update public.users set tokens = tokens - p_amount where id = p_user_id;

  insert into public.votes (user_id, match_id, side, amount)
    values (p_user_id, p_match_id, p_side, p_amount)
    returning id into v_vote_id;

  return jsonb_build_object('tokens', v_tokens - p_amount, 'vote_id', v_vote_id);
exception
  when unique_violation then raise exception 'ALREADY_VOTED';
end;
$$;

-- ── undo_vote ─────────────────────────────────────────────────────────────────
-- Deletes the caller's vote (only while the match is live + voting open) and
-- refunds the tokens, atomically. Returns the new balance.
create or replace function public.undo_vote(
  p_user_id text,
  p_vote_id uuid
) returns integer
language plpgsql
as $$
declare
  v_match_id uuid;
  v_active   boolean;
  v_open     boolean;
  v_winner   text;
  v_amount   integer;
  v_tokens   integer;
begin
  -- Lock + fetch the vote (must belong to the caller).
  select match_id, amount into v_match_id, v_amount
    from public.votes where id = p_vote_id and user_id = p_user_id for update;
  if not found then raise exception 'VOTE_NOT_FOUND'; end if;

  select is_active, voting_open, winner_side into v_active, v_open, v_winner
    from public.matches where id = v_match_id for update;
  if v_active is not true or v_winner is not null then raise exception 'MATCH_RESOLVED'; end if;
  if v_open is false then raise exception 'VOTING_CLOSED'; end if;

  delete from public.votes where id = p_vote_id;

  update public.users set tokens = tokens + v_amount where id = p_user_id
    returning tokens into v_tokens;

  return v_tokens;
end;
$$;
