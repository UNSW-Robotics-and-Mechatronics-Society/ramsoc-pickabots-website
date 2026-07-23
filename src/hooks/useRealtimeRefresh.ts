'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase-browser'

const POLL_MS = 5000

/**
 * Re-runs this page's server-fetched data (via router.refresh(), which
 * preserves client-side state like scroll/zoom/filters — only the server
 * component's props change) whenever any of the given public tables
 * change. Uses Supabase Realtime when the anon key is configured, falling
 * back to polling otherwise — same pattern VotePage already uses for
 * `matches`, just generalized to any table list.
 */
export function useRealtimeRefresh(tables: string[]) {
  const router = useRouter()
  const tableKey = tables.join(',')

  useEffect(() => {
    const sb = getBrowserSupabase()
    if (sb) {
      let channel = sb.channel(`public:${tableKey}`)
      for (const table of tableKey.split(',')) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => router.refresh())
      }
      channel.subscribe()
      return () => { sb.removeChannel(channel) }
    }
    const id = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey])
}
