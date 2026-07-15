-- ─────────────────────────────────────────────────────
--  PICKABOTS — live bracket + betting schema
--  Paste into Supabase Dashboard → SQL Editor → Run once
--
--  Notes:
--  - `public.teams` already exists and is SHARED with the sumobots site
--    (id uuid, name, category 'standard'|'open', join_code, paid,
--    competition_year, created_by, created_at, updated_at). This migration
--    does NOT alter that table — all pickabots-only fields live in
--    `pickabots_team_state`, joined 1:1 by team_id.
--  - `public.users` / `public.matches` / `public.bets` do not exist yet in
--    this project (the old supabase/schema.sql was never applied here) —
--    they're created fresh below, replacing that file going forward.
-- ─────────────────────────────────────────────────────

-- Pickabots-only per-team bracket/admin state.
create table if not exists public.pickabots_team_state (
  team_id    uuid primary key references public.teams(id) on delete cascade,
  seed       integer,
  points     integer not null default 0,
  comment    text not null default '',
  present    boolean not null default false,
  wildcard   boolean not null default false,
  updated_at timestamptz not null default now()
);

-- One row per generated bracket match (double-elimination).
-- Team slots are keyed by name (matching existing bracket logic throughout
-- the app); slot_*_team_id is a denormalized convenience FK resolved by
-- name lookup at save time, null when the slot is empty or unmatched.
create table if not exists public.bracket_matches (
  id             text primary key, -- e.g. "standard-wb-r1-m1"
  division       text not null check (division in ('standard', 'open')),
  side           text not null check (side in ('winners', 'losers', 'finals-semi', 'finals-final', 'finals-third')),
  round          integer not null,
  match_number   integer not null,
  slot_a_name    text not null default '',
  slot_a_team_id uuid references public.teams(id) on delete set null,
  slot_a_score   integer not null default 0,
  slot_b_name    text not null default '',
  slot_b_team_id uuid references public.teams(id) on delete set null,
  slot_b_score   integer not null default 0,
  target_score   integer not null default 2,
  status         text not null default 'todo' check (status in ('todo', 'next', 'active', 'completed', 'skipped')),
  version        integer not null default 0,
  updated_at     timestamptz not null default now()
);

-- Current bracket size per division.
create table if not exists public.bracket_config (
  division   text primary key check (division in ('standard', 'open')),
  team_count integer not null
);

-- Ring/timing schedule per division, stored as one JSON blob (matches how
-- src/lib/schedule.ts already treats it as a single unit).
create table if not exists public.bracket_schedule (
  division   text primary key references public.bracket_config(division) on delete cascade,
  schedule   jsonb not null,
  version    integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Users (keyed by Clerk userId, e.g. "user_2abc...").
create table if not exists public.users (
  id           text primary key,
  display_name text,
  tokens       integer not null default 100,
  created_at   timestamptz default now()
);

-- Betting matches. Each row is opened by the admin against a live bracket
-- match (bracket_match_id) and auto-resolved when that bracket match
-- completes — see src/app/api/admin/bracket route.
create table if not exists public.matches (
  id               uuid primary key default gen_random_uuid(),
  bracket_match_id text references public.bracket_matches(id) on delete set null,
  comp_type        text not null check (comp_type in ('standard', 'open', 'bossbot')),
  is_bossbot       boolean not null default false,
  left_name        text not null,
  left_color       text not null default '#1A6CFF',
  left_shape       text not null default 'wedge',
  right_name       text not null,
  right_color      text not null default '#FF2D2D',
  right_shape      text not null default 'spinner',
  is_active        boolean not null default true,
  winner_side      text check (winner_side in ('left', 'right')) default null,
  created_at       timestamptz default now()
);

create table if not exists public.bets (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references public.users(id) on delete cascade,
  match_id   uuid not null references public.matches(id) on delete cascade,
  side       text not null check (side in ('left', 'right')),
  amount     integer not null check (amount >= 1 and amount <= 50),
  created_at timestamptz default now(),
  unique (user_id, match_id)
);

-- Row Level Security (writes handled server-side only via the secret key)
alter table public.pickabots_team_state enable row level security;
alter table public.bracket_matches      enable row level security;
alter table public.bracket_config       enable row level security;
alter table public.bracket_schedule     enable row level security;
alter table public.users                enable row level security;
alter table public.matches              enable row level security;
alter table public.bets                 enable row level security;

-- Public read for anything the voting/leaderboard/bracket pages display.
create policy "bracket_matches_public_read"    on public.bracket_matches    for select using (true);
create policy "bracket_config_public_read"     on public.bracket_config     for select using (true);
create policy "pickabots_team_state_public_read" on public.pickabots_team_state for select using (true);
create policy "matches_public_read"            on public.matches            for select using (true);
