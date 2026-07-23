-- ============================================================================
-- 0005_votes_table.sql
-- The app's code was renamed betting -> voting (bets -> votes, bidding_open
-- -> voting_open — see rewardWinners(), getLeaderboard(), api/votes,
-- bracket.ts) but no migration ever shipped for it: every prior migration
-- still only defines public.bets, and nothing renames bidding_open. This
-- catches Supabase up to the current code:
--   1. Creates public.votes fresh (it never existed under either name),
--      including the payout column from day one — 0 for a losing vote, the
--      parimutuel share for a winning one, null while unresolved — so the
--      coin ledger can read gain/loss straight off the row.
--   2. Renames bidding_open -> voting_open on both public.matches and
--      public.bracket_matches (safe if already renamed, or if this is a
--      fresh install that never had bidding_open at all).
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references public.users(id) on delete cascade,
  match_id   uuid not null references public.matches(id) on delete cascade,
  side       text not null check (side in ('left', 'right')),
  amount     integer not null check (amount >= 1 and amount <= 50),
  payout     numeric,
  created_at timestamptz default now(),
  unique (user_id, match_id)
);

alter table public.votes enable row level security;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'bidding_open'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'voting_open'
  ) then
    alter table public.matches rename column bidding_open to voting_open;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bracket_matches' and column_name = 'bidding_open'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bracket_matches' and column_name = 'voting_open'
  ) then
    alter table public.bracket_matches rename column bidding_open to voting_open;
  end if;
end $$;

-- Covers a fresh install that never had bidding_open at all.
alter table public.matches         add column if not exists voting_open boolean not null default true;
alter table public.bracket_matches add column if not exists voting_open boolean not null default true;
