-- ─────────────────────────────────────────────────────
--  PICKABOTS — Supabase schema
--  Paste into Supabase Dashboard → SQL Editor → Run once
-- ─────────────────────────────────────────────────────

-- Users (keyed by Clerk userId e.g. "user_2abc...")
create table if not exists public.users (
  id         text primary key,
  tokens     integer not null default 100,
  created_at timestamptz default now()
);

-- Matches
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  comp_type   text not null check (comp_type in ('standards','opens','bossbot')),
  is_bossbot  boolean not null default false,
  left_name   text not null,
  left_color  text not null default '#1A6CFF',
  left_shape  text not null default 'wedge',
  right_name  text not null,
  right_color text not null default '#FF2D2D',
  right_shape text not null default 'spinner',
  is_active   boolean not null default true,
  winner_side text check (winner_side in ('left','right')) default null,
  created_at  timestamptz default now()
);

-- Bets
create table if not exists public.bets (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null references public.users(id) on delete cascade,
  match_id   uuid not null references public.matches(id) on delete cascade,
  side       text not null check (side in ('left','right')),
  amount     integer not null check (amount >= 1 and amount <= 50),
  created_at timestamptz default now(),
  unique (user_id, match_id)
);

-- Row Level Security (writes handled server-side only via service role key)
alter table public.users   enable row level security;
alter table public.matches enable row level security;
alter table public.bets    enable row level security;

-- Matches are public read
create policy "matches_public_read" on public.matches for select using (true);

-- ── Seed data ──────────────────────────────────────────────────────────────
insert into public.matches (comp_type, is_bossbot, left_name, left_color, left_shape, right_name, right_color, right_shape)
values
  ('standards', false, 'Wedge Wolf',  '#1A6CFF', 'wedge',   'Spinner Rex', '#FF6B00', 'spinner'),
  ('opens',     false, 'Flipper 3K',  '#00BFFF', 'flipper', 'Drum Lord',   '#FF2D2D', 'drum'),
  ('standards', false, 'Lifter X',    '#9B59B6', 'lifter',  'Full Body',   '#27AE60', 'fullbody'),
  ('bossbot',   true,  'Challenger',  '#1A6CFF', 'wedge',   'BOSSBOT',     '#9B30FF', 'bossbot');
