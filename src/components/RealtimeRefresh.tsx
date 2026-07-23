'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase-browser'

/**
 * Drop-in live-updates for the otherwise-static (force-dynamic, fetched-once)
 * public pages. Subscribes to the given Supabase tables and calls
 * router.refresh() on any change — which re-runs the page's server fetch and
 * streams fresh props in without a full reload or client-side data duplication.
 *
 * Changes are debounced (an admin bracket save upserts many rows → one refresh),
 * and when Realtime isn't configured (no NEXT_PUBLIC_SUPABASE_ANON_KEY) it falls
 * back to a gentle poll so viewers still get updates. Set the anon key to switch
 * from polling to instant push. Renders nothing.
 */
export default function RealtimeRefresh({
  tables,
  pollMs = 15000,
}: {
  tables: string[]
  pollMs?: number
}) {
  const router = useRouter()
  const key = tables.join(',')

  useEffect(() => {
    const tableList = key.split(',')
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), 400)
    }

    const sb = getBrowserSupabase()
    if (sb) {
      const channel = sb.channel(`rt-refresh:${key}`)
      for (const table of tableList) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)
      }
      channel.subscribe()
      return () => {
        clearTimeout(timer)
        sb.removeChannel(channel)
      }
    }

    // No anon key → Realtime unavailable. Poll so the page still updates.
    const id = setInterval(() => router.refresh(), pollMs)
    return () => {
      clearTimeout(timer)
      clearInterval(id)
    }
  }, [router, key, pollMs])

  return null
}
