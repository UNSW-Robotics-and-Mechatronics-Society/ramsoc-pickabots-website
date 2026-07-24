-- ─────────────────────────────────────────────────────
--  Fix: voting for a brand-new user could fail.
--
--  Onboarding used to run before /voting was reachable, so by the time a vote
--  was placed, public.users already had a row for the caller (created by
--  completeOnboarding()). Onboarding is now optional (see src/proxy.ts,
--  ONBOARDING_GATE_ENABLED), so a signed-up user can reach /voting with no
--  users row yet. place_vote's `if not found then raise exception 'NO_USER'`
--  then fires, which the API maps to a misleading "Not enough tokens" error.
--  Separately, the app's own lazy-create paths (GET /api/user, attemptBeg)
--  are non-atomic check-then-insert and can race into a real
--  `duplicate key value violates unique constraint "users_pkey"` (23505).
--
--  Fix: make place_vote the single source of truth — it provisions the row
--  itself, atomically, before locking it. All columns besides `id` already
--  have defaults (see 0002_pickabots_live.sql, 0010/0011 add-column defaults),
--  so a bare insert is enough.
-- ─────────────────────────────────────────────────────

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

  -- Ensure the user row exists (new sign-ups may not have onboarded yet).
  insert into public.users (id) values (p_user_id) on conflict (id) do nothing;

  -- Lock the user row; enforce balance + the 50%-of-balance cap.
  select tokens into v_tokens from public.users where id = p_user_id for update;
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
