-- ============================================================================
-- 0014_users_realtime.sql
-- Makes the public Leaderboard's token totals update live when a match resolves.
--
-- The Leaderboard ranks players by public.users.tokens, but `users` was never
-- added to the supabase_realtime publication (unlike matches/votes in 0003/0006).
-- When an admin resolves a match, rewardWinners() writes the payout to
-- users.tokens as its LAST write — and nothing was subscribed to `users`, so the
-- page only refreshed on the incidental matches/votes events that fire *before*
-- the payout lands. Net effect: token standings didn't move until a manual
-- reload.
--
-- RLS is already enabled on `users` (see 0002). Realtime enforces RLS for the
-- anon key, so without a SELECT policy the browser client receives no change
-- events for the table. `users` holds no PII — only id, tokens, display_name,
-- created_at, all of which the Leaderboard already sends to the browser — so a
-- public-read policy exposes nothing new. Then add `users` to the publication.
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

drop policy if exists "users_public_read" on public.users;
create policy "users_public_read" on public.users for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
end $$;
