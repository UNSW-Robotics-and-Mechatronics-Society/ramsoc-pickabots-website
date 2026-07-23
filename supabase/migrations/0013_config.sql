-- ─────────────────────────────────────────────────────
--  PICKABOTS — admin-editable config (key/value)
--  Paste into Supabase Dashboard → SQL Editor → Run once.
--
--  Currently holds the "up next" SMS template (editable in the admin panel).
--  Generic key/value so future admin-tunable settings can reuse it.
-- ─────────────────────────────────────────────────────

create table if not exists public.pickabots_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.pickabots_config enable row level security;
-- No public policy: config is written/read server-side via the service key only.

-- Seed the default SMS template (kept in sync with lib/sms-template.ts).
insert into public.pickabots_config (key, value) values
  ('sms_up_next_template',
   'RAMSOC Pickabots: Team "{team}" you''re UP NEXT in {division}. Please head to the arena and check in with a judge.')
on conflict (key) do nothing;

-- How many matches ahead of playing to text a team's captains (default 2).
insert into public.pickabots_config (key, value) values ('sms_notify_lead', '2')
on conflict (key) do nothing;
