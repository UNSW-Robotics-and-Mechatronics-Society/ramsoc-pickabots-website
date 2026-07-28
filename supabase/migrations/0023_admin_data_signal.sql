-- ============================================================================
-- 0023_admin_data_signal.sql
-- Live sync for the admin page's TEAM data (regular teams, their pickabots
-- state, and special teams) between admins working at the same time.
--
-- Why a signal table instead of subscribing to the tables themselves:
-- Realtime enforces RLS for the anon key the browser uses, so a subscription to
-- special_teams / pickabots_team_state would need a public-read policy on them —
-- and those tables hold contact details (special_teams.email/phone) and private
-- admin notes. The anon key ships in the client bundle, so "public read" there
-- means publishing that PII to anyone who looks. Not acceptable.
--
-- Instead, this one-row table carries NOTHING but a timestamp. It's public-read
-- and in the realtime publication; admins subscribe to it, and a bump makes them
-- refetch through the admin-gated /api/admin/teams and
-- /api/admin/special-teams endpoints. Live updates, zero data exposure.
-- Same pattern as 0019_leaderboard_signal.
--
-- Bumped by TRIGGERS rather than app code, so it also fires for writes this app
-- doesn't make: team registrations from the separate ramsoc-sumobots-website
-- (public.teams is shared with it) and hand edits in the Supabase dashboard.
--
-- NOTE: this adds a trigger to the SHARED public.teams table. It only touches
-- this project's own signal row and cannot fail a registration write (security
-- definer, and the row is created below). If you'd rather leave the shared table
-- completely alone, drop just the teams_bump_admin_signal trigger — the cost is
-- that a brand-new registration appears on an open admin page at the next tab
-- focus or fallback poll rather than instantly.
--
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

create table if not exists public.admin_data_signal (
  id        smallint primary key default 1,
  bumped_at timestamptz not null default now(),
  constraint admin_data_signal_singleton check (id = 1)
);

insert into public.admin_data_signal (id) values (1) on conflict (id) do nothing;

-- Public read (same posture as leaderboard_signal). Safe because the row holds
-- only a timestamp — no team, contact or note data is reachable through it.
-- Writes are the trigger's alone; nothing grants insert/update/delete.
alter table public.admin_data_signal enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_data_signal'
      and policyname = 'admin_data_signal_public_read'
  ) then
    create policy admin_data_signal_public_read
      on public.admin_data_signal for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'admin_data_signal'
  ) then
    alter publication supabase_realtime add table public.admin_data_signal;
  end if;
end $$;

-- security definer so the bump succeeds no matter which role made the write
-- (RLS grants no one else write access to the signal row).
create or replace function public.bump_admin_data_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_data_signal set bumped_at = now() where id = 1;
  return null;
end;
$$;

-- FOR EACH STATEMENT, not FOR EACH ROW: a bulk seed import upserting 32 rows
-- should wake every admin once, not 32 times.
drop trigger if exists special_teams_bump_admin_signal on public.special_teams;
create trigger special_teams_bump_admin_signal
  after insert or update or delete on public.special_teams
  for each statement execute function public.bump_admin_data_signal();

drop trigger if exists team_state_bump_admin_signal on public.pickabots_team_state;
create trigger team_state_bump_admin_signal
  after insert or update or delete on public.pickabots_team_state
  for each statement execute function public.bump_admin_data_signal();

-- The shared registration table — see the NOTE above.
drop trigger if exists teams_bump_admin_signal on public.teams;
create trigger teams_bump_admin_signal
  after insert or update or delete on public.teams
  for each statement execute function public.bump_admin_data_signal();
