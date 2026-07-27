-- ─────────────────────────────────────────────────────
--  PICKABOTS — leaderboard "refresh signal"
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--
--  The leaderboard subscribes to `matches` only, so it refreshes when a game
--  resolves but NOT on every bet (a vote writes votes+users, never matches).
--  That's deliberate — subscribing to `users` would fire on every token
--  deduction and churn constantly during voting.
--
--  But two NON-game events also change balances and should show up right away:
--  the beg reward and admin token edits/kicks. This one-row table is the signal
--  for exactly those: the app bumps `bumped_at` after such a change, and the
--  leaderboard (subscribed to this table too) refreshes — without ever
--  subscribing to the high-churn `users` table.
-- ─────────────────────────────────────────────────────

create table if not exists public.leaderboard_signal (
  id        smallint primary key default 1,
  bumped_at timestamptz not null default now(),
  constraint leaderboard_signal_singleton check (id = 1)
);

insert into public.leaderboard_signal (id) values (1) on conflict (id) do nothing;

-- Public read (same posture as the other public realtime tables) so the
-- anon-key browser client receives realtime events. Writes are server-only via
-- the service role, which bypasses RLS.
alter table public.leaderboard_signal enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'leaderboard_signal'
      and policyname = 'leaderboard_signal_public_read'
  ) then
    create policy leaderboard_signal_public_read
      on public.leaderboard_signal for select using (true);
  end if;
end $$;

-- Add to the realtime publication so postgres_changes events are broadcast.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'leaderboard_signal'
  ) then
    alter publication supabase_realtime add table public.leaderboard_signal;
  end if;
end $$;
