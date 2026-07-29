-- ============================================================================
-- 0021_vote_upcoming_match.sql
-- Lets voting open on the UPCOMING ("next") match in a ring, not just the
-- currently active one — e.g. so people can lock in a bet before a match
-- starts. place_vote previously required is_active = true; that's now
-- replaced by a winner_side check (a resolved match can never take a vote,
-- active or not) plus the existing voting_open gate, which is what actually
-- decides biddability now that voting_open can be true on a "next" row too
-- (see reconcileVotingMatches in src/lib/db/bracket.ts).
--
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

create or replace function public.place_vote(
  p_user_id  text,
  p_match_id uuid,
  p_side     text,
  p_amount   integer
) returns jsonb
language plpgsql
as $$
declare
  v_voting_open boolean;
  v_winner_side text;
  v_tokens      integer;
  v_vote_id     uuid;
  v_all_in      text;
begin
  if p_amount is null or p_amount < 1 then raise exception 'BAD_AMOUNT'; end if;
  if p_side not in ('left','right')  then raise exception 'BAD_SIDE';   end if;

  -- Lock the match row; confirm it's not resolved and voting is open.
  select voting_open, winner_side into v_voting_open, v_winner_side
    from public.matches where id = p_match_id for update;
  if not found              then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_winner_side is not null then raise exception 'MATCH_RESOLVED'; end if;
  if v_voting_open is false then raise exception 'VOTING_CLOSED';  end if;

  -- Ensure the user row exists (new sign-ups may not have onboarded yet).
  insert into public.users (id) values (p_user_id) on conflict (id) do nothing;

  -- Lock the user row; enforce balance + (unless ALL IN) the 50%-of-balance cap.
  select tokens into v_tokens from public.users where id = p_user_id for update;
  if v_tokens < p_amount then raise exception 'INSUFFICIENT_TOKENS'; end if;

  select value into v_all_in from public.pickabots_config where key = 'all_in';
  if coalesce(v_all_in, 'false') <> 'true'
     and p_amount > floor(v_tokens * 0.5) then
    raise exception 'EXCEEDS_MAX';
  end if;

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
