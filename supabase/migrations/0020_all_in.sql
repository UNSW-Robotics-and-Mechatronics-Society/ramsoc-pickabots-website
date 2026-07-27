-- ============================================================================
-- 0020_all_in.sql
-- "ALL IN" mode — an admin toggle that lifts the 50%-of-balance-per-vote cap.
--
-- The cap is enforced server-side inside place_vote (see 0015). This recreates
-- place_vote so it reads the `all_in` config flag and skips the EXCEEDS_MAX
-- check when it's 'true'. The INSUFFICIENT_TOKENS floor still applies — you can
-- never vote more RamCoin than you actually hold.
--
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

-- Default the flag off. Stored as text to match the generic key/value config.
insert into public.pickabots_config (key, value) values ('all_in', 'false')
on conflict (key) do nothing;

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
  v_all_in      text;
begin
  if p_amount is null or p_amount < 1 then raise exception 'BAD_AMOUNT'; end if;
  if p_side not in ('left','right')  then raise exception 'BAD_SIDE';   end if;

  -- Lock the match row; confirm it's live and open.
  select is_active, voting_open into v_active, v_voting_open
    from public.matches where id = p_match_id for update;
  if not found            then raise exception 'MATCH_NOT_FOUND'; end if;
  if v_active is not true  then raise exception 'MATCH_INACTIVE';  end if;
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
