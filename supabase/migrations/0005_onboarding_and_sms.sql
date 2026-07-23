-- ─────────────────────────────────────────────────────
--  PICKABOTS — onboarding link + captain SMS support
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--
--  Context:
--  - `public.profiles` / `public.teams` / `public.team_members` already exist
--    and are SHARED with the sumobots site (see sumobots migration 001). This
--    migration does NOT alter them. Pickabots resolves a signed-in Clerk user
--    to their sumobots registration BY EMAIL (Clerk instances differ between
--    the two apps, so clerk_user_id does NOT match across them — profiles.email
--    is the only stable bridge).
--  - `public.users` is the pickabots-local per-user state (betting tokens etc).
--    We add an onboarding flag + a cached link to the matched shared profile.
-- ─────────────────────────────────────────────────────

-- Pickabots onboarding state on the local users row.
alter table public.users
  add column if not exists onboarded  boolean not null default false;

-- Cached FK to the shared sumobots profile matched by email at onboarding time
-- (nullable: a pure spectator who never registered for sumobots has none).
alter table public.users
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

-- Whether this pickabots user explicitly chose "just spectating" (no team).
-- Distinguishes "onboarded, no team on purpose" from "not onboarded yet".
alter table public.users
  add column if not exists is_spectator boolean not null default false;

-- Dedup flag so the "your team is up next" SMS fires at most once per bracket
-- match as it enters the on-deck ("next") slot. A manual re-send from the admin
-- UI ignores this flag.
alter table public.bracket_matches
  add column if not exists captain_notified boolean not null default false;

-- Audit log of every SMS the pickabots admin/judge tools send (manual or auto).
create table if not exists public.pickabots_sms_log (
  id           uuid primary key default gen_random_uuid(),
  to_number    text not null,
  sender       text not null default 'RAMSOC',
  body         text not null,
  team_id      uuid references public.teams(id) on delete set null,
  match_id     text references public.bracket_matches(id) on delete set null,
  kind         text not null default 'manual' check (kind in ('manual', 'auto_next')),
  status       text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  error        text,
  created_at   timestamptz not null default now()
);

alter table public.pickabots_sms_log enable row level security;
-- No public read policy: SMS logs contain phone numbers and are admin-only,
-- read exclusively via the service-role key on the server.
