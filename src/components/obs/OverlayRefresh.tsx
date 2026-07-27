'use client'

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'

/**
 * The overlays are server components (all derivation — ring→match, standings —
 * happens server-side); this is their only client piece: re-run the server
 * render when the subscribed tables change. Tighter interval than the public
 * pages' 3s — an on-air lower-third lagging a scene cut is visible to the
 * whole stream, and the audience here is six OBS browser sources, not a crowd.
 */
export default function OverlayRefresh({ tables, intervalMs = 1500 }: { tables: string[]; intervalMs?: number }) {
  useRealtimeRefresh(tables, { intervalMs })
  return null
}
