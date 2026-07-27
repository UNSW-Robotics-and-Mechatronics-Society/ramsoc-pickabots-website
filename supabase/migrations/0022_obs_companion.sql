-- ─────────────────────────────────────────────────────
--  PICKABOTS — OBS streaming companion
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--
--  The live stream is produced in OBS on a PC at the venue. obs-websocket only
--  listens on that machine's local interface, so the hosted control panel
--  can't reach it directly — instead a relay agent on the OBS PC keeps an
--  OUTBOUND Supabase Realtime subscription open and executes what it hears.
--  These two tables are that wire:
--
--  • pickabots_obs_commands — an append-only command queue. The control panel
--    (admin-gated API route, service role) INSERTs a row per button press
--    ("switch to Ring 3", "start streaming", …); the relay receives the INSERT
--    over Realtime, runs it against OBS via obs-websocket, and writes back
--    status/error. Rows are kept (not deleted on completion) as an audit log
--    of what was pressed during the stream; `reset-all` style cleanup can
--    truncate it between events.
--
--  • pickabots_obs_state — a SINGLETON row (same pattern as
--    leaderboard_signal) holding what the stream currently looks like: which
--    scene OBS is on, whether it's streaming/recording, when the relay last
--    heartbeated (the control panel's "is the relay alive?" light), plus the
--    manual "Now Battling" override the admin can type in when the derived
--    bracket state isn't what should be on screen (e.g. an unscheduled
--    exhibition bout). Overlays and the control panel subscribe to this row.
--
--  The relay authenticates with the service role key from a local .env on the
--  OBS PC (same trust level as the Vercel deployment; the venue PC is ours).
--  Realtime events for the command INSERT respect RLS for anon subscribers —
--  the relay's service-role subscription bypasses RLS, which is why commands
--  need no public policy at all.
-- ─────────────────────────────────────────────────────

-- ── Command queue ────────────────────────────────────

create table if not exists public.pickabots_obs_commands (
  id         uuid primary key default gen_random_uuid(),
  -- What the relay should do. Mirrors the obs-websocket v5 requests we use;
  -- kept as a CHECK (not an enum type) so extending it is a plain migration.
  action     text not null check (action in (
    'set_scene',            -- payload: { "scene": "Ring 3" }
    'start_stream', 'stop_stream',
    'start_record', 'stop_record',
    'start_replay_buffer', 'save_replay_buffer'
  )),
  payload    jsonb not null default '{}'::jsonb,
  -- pending → done/failed, written by the relay after execution. 'stale' is
  -- set by the relay on startup for pending rows older than its grace window,
  -- so a backlog queued while the relay was down doesn't replay as a burst of
  -- scene flips when it comes back.
  status     text not null default 'pending'
             check (status in ('pending', 'done', 'failed', 'stale')),
  error      text,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);

-- The relay's catch-up poll (fallback for a dropped Realtime socket) scans
-- for pending work in arrival order.
create index if not exists pickabots_obs_commands_pending_idx
  on public.pickabots_obs_commands (created_at)
  where status = 'pending';

-- Admin/relay only — RLS on with NO policies (the special_teams posture):
-- the anon key can neither read the queue nor inject commands; every path in
-- is the service role (control-panel API route, relay agent).
alter table public.pickabots_obs_commands enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'pickabots_obs_commands'
  ) then
    alter publication supabase_realtime add table public.pickabots_obs_commands;
  end if;
end $$;

-- ── Current stream state (singleton) ─────────────────

create table if not exists public.pickabots_obs_state (
  id                 smallint primary key default 1,
  -- Written by the relay from OBS events (scene changed in OBS itself counts
  -- too, not just panel-driven switches), so the panel always shows truth.
  current_scene      text not null default '',
  streaming          boolean not null default false,
  recording          boolean not null default false,
  replay_buffer      boolean not null default false,
  -- Relay liveness: bumped every heartbeat tick. The panel shows "connected"
  -- iff this is fresher than ~2 ticks; obs_connected distinguishes "relay up
  -- but OBS closed" from "relay down" (both matter mid-event).
  relay_seen_at      timestamptz,
  obs_connected      boolean not null default false,
  -- Proof-of-life for the broadcast, refreshed each heartbeat while
  -- streaming: { timecode, kbps, droppedPct, congestion }. kbps is measured
  -- from the byte counter delta between heartbeats — actual data leaving the
  -- encoder, not just "output flag is on" — so the panel can show the stream
  -- is genuinely flowing (and healthy) rather than silently stalled.
  stream_stats       jsonb not null default '{}'::jsonb,
  -- Remote-room RTMP ingest health, polled from MediaMTX's control API each
  -- heartbeat: { "room2": true, "room3": false, "phone": true } — true while
  -- that path has a live publisher. Empty when MediaMTX monitoring is off.
  feed_status        jsonb not null default '{}'::jsonb,
  -- Most recent failed command, surfaced as a banner on the control panel
  -- (buttons are fire-and-forget; without this a failure is only visible in
  -- the relay's console at the venue desk).
  last_error         text,
  last_error_at      timestamptz,
  -- Manual lower-third override. When `override_active`, the now-battling
  -- overlay shows these instead of the bracket-derived active match for its
  -- ring. ring 0 = "all rings" (a single-feed moment like finals).
  override_active    boolean not null default false,
  override_ring      integer not null default 0,
  override_left      text not null default '',
  override_right     text not null default '',
  updated_at         timestamptz not null default now(),
  constraint pickabots_obs_state_singleton check (id = 1)
);

insert into public.pickabots_obs_state (id) values (1) on conflict (id) do nothing;

-- Public read: the overlay pages run in OBS browser sources on the anon key
-- and must receive Realtime updates for the override + connection status.
-- Nothing here is sensitive (scene names and booleans). Writes are relay /
-- server-only via the service role, which bypasses RLS.
alter table public.pickabots_obs_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pickabots_obs_state'
      and policyname = 'pickabots_obs_state_public_read'
  ) then
    create policy pickabots_obs_state_public_read
      on public.pickabots_obs_state for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'pickabots_obs_state'
  ) then
    alter publication supabase_realtime add table public.pickabots_obs_state;
  end if;
end $$;
