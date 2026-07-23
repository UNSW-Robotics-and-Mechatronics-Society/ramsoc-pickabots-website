import { NextResponse } from 'next/server'
import { getUserLedger } from '@/lib/db/ledger'

// GET /api/leaderboard/[id] — a pilot's public coin ledger (past votes, total
// gained/lost, win rate). Deliberately unauthenticated: the leaderboard
// already shows every pilot's credits and W/L record publicly, so their
// vote-by-vote history is public too, same as everywhere else on this page.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const ledger = await getUserLedger(id)
    if (!ledger) return NextResponse.json({ error: 'Pilot not found' }, { status: 404 })
    return NextResponse.json(ledger)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load ledger' }, { status: 500 })
  }
}
