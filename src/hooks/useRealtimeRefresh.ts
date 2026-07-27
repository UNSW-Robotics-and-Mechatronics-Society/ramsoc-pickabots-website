'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase-browser'

/**
 * Re-runs this page's server-fetched data (via router.refresh(), which
 * preserves client-side state like scroll/zoom/filters — only the server
 * component's props change) whenever any of the given public tables change.
 *
 * Refreshes are coalesced with a trailing throttle: the first change schedules
 * a single refresh `intervalMs` later, and every further change in that window
 * folds into it. This is what lets the app hold a large audience — a burst of
 * row writes from an admin save, or 500 viewers all receiving the same change,
 * can't turn into a storm of refetches; each client refreshes at most once per
 * `intervalMs`, and the server fetches those refreshes hit are cached (see
 * unstable_cache in lib/db/*), so concurrent refreshes collapse to one DB read.
 *
 * `intervalMs` also doubles as a settle delay. The leaderboard, for example,
 * subscribes to `matches` only (so it moves when a game resolves, not on every
 * bet) and needs the payout writes to `users.tokens` — made just after
 * `matches.winner_side` — to land before it refetches.
 *
 * Falls back to a slow poll when Realtime isn't configured (no anon key).
 */
export function useRealtimeRefresh(
  tables: string[],
  { intervalMs = 3000, fallbackPollMs = 30000 }: { intervalMs?: number; fallbackPollMs?: number } = {},
) {
  const router = useRouter()
  const tableKey = tables.join(',')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // Trailing throttle: once a refresh is pending, further changes fold in
    // rather than each scheduling their own.
    const schedule = () => {
      if (timer) return
      timer = setTimeout(() => { timer = undefined; router.refresh() }, intervalMs)
    }

    const sb = getBrowserSupabase()
    if (sb) {
      let channel = sb.channel(`public:${tableKey}`)
      for (const table of tableKey.split(',')) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
      }
      channel.subscribe()
      return () => { if (timer) clearTimeout(timer); sb.removeChannel(channel) }
    }

    const id = setInterval(() => router.refresh(), fallbackPollMs)
    return () => { if (timer) clearTimeout(timer); clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, intervalMs, fallbackPollMs])
}
