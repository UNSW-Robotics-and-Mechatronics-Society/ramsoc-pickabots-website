-- ─────────────────────────────────────────────────────
--  PICKABOTS — parimutuel migration
--  Paste into Supabase Dashboard → SQL Editor → Run once
--  (after schema.sql has already been applied)
-- ─────────────────────────────────────────────────────

-- Match lifecycle status
alter table public.matches
  add column if not exists status text not null default 'open'
    check (status in ('open', 'closed', 'resolved')),
  add column if not exists betting_closes_at timestamptz,
  add column if not exists resolved_at timestamptz;

-- Payout tracking on bets
alter table public.bets
  add column if not exists payout integer,
  add column if not exists refunded boolean not null default false;
