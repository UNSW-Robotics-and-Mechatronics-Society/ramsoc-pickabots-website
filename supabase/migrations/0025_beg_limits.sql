-- ============================================================================
-- 0025_beg_limits.sql
-- Admin-tunable limits for the beg-for-RamCoin dial:
--   beg_threshold  — a player may only beg while STRICTLY under this balance
--                    (i.e. how broke "broke" is)
--   beg_max_award  — what a dead-centre dial pays; the band edge pays
--                    BEG_MIN_AWARD (6) or this, whichever is smaller
-- The award ceiling (the most a beg can ever leave you holding) is derived as
-- beg_threshold + beg_max_award, so it isn't stored.
--
-- Enforcement is entirely server-side in TypeScript (src/lib/db/beg.ts reads
-- both keys on every /api/beg call), so nothing here changes any function — this
-- just seeds the defaults so the keys exist and are visible alongside the other
-- settings. Missing rows fall back to the same defaults in code.
--
-- Paste into Supabase Dashboard -> SQL Editor -> Run once.
-- ============================================================================

-- Defaults match DEFAULT_BEG_THRESHOLD / DEFAULT_BEG_MAX_AWARD in
-- src/lib/beg-config.ts. Stored as text to match the generic key/value config.
insert into public.pickabots_config (key, value) values
  ('beg_threshold', '10'),
  ('beg_max_award', '20')
on conflict (key) do nothing;
