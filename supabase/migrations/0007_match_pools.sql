-- ─────────────────────────────────────────────────────
--  PICKABOTS — live odds via Realtime (denormalized vote pools on `matches`)
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--
--  Why: the voting page used to poll /api/matches/[id]/standings every 3s per
--  active match (≈130 req/s at 200 users, on an unindexed votes read). Instead
--  we keep running pool totals ON the `matches` row and update them atomically
--  as votes are placed/undone. `matches` is already in the `supabase_realtime`
--  publication with public-read RLS (migrations 0002/0003), so every pool change
--  streams to all clients, who recompute odds locally — no polling, no herd, and
--  no exposure of individual votes (only aggregates live on `matches`).
--
--  IMPORTANT: Realtime only actually fires once NEXT_PUBLIC_SUPABASE_ANON_KEY is
--  set in the app env (see audit finding F1). Until then the client falls back
--  to a slow poll of /api/matches (which now carries the pools).
-- ─────────────────────────────────────────────────────

alter table public.matches add column if not exists pool_left   integer not null default 0;
alter table public.matches add column if not exists pool_right  integer not null default 0;
alter table public.matches add column if not exists votes_left  integer not null default 0;
alter table public.matches add column if not exists votes_right integer not null default 0;

-- Backfill from existing votes so current matches show correct odds immediately.
update public.matches m set
  pool_left   = coalesce((select sum(amount) from public.votes v where v.match_id = m.id and v.side = 'left'),  0),
  pool_right  = coalesce((select sum(amount) from public.votes v where v.match_id = m.id and v.side = 'right'), 0),
  votes_left  = coalesce((select count(*)    from public.votes v where v.match_id = m.id and v.side = 'left'),  0),
  votes_right = coalesce((select count(*)    from public.votes v where v.match_id = m.id and v.side = 'right'), 0);

-- NOTE: pool mutations are performed atomically inside the place_vote / undo_vote
-- transactional functions (migration 0008), so they always commit together with
-- the token deduction and the vote row.
