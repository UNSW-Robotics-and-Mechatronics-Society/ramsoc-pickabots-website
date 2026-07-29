import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import supabase from '@/lib/supabase'
import { getLiveStandings, type VoteEntry } from '@/lib/vote-pool'
import type { VoteStandings } from '@/lib/types'

// Live odds for every biddable match (active OR next-with-voting-open) in one
// cached response. The voting page polls this once per tick instead of firing
// one request per match per viewer, and the short TTL collapses all viewers'
// polls into a single vote scan every ~2s. This is the dominant read on the
// voting path at scale, so caching it is the biggest efficiency win there —
// odds are already only as fresh as the poll, so a 2s cache is invisible to
// users.
const getActiveStandings = unstable_cache(
  async (): Promise<Record<string, VoteStandings>> => {
    const { data: activeMatches, error: mErr } = await supabase
      .from('matches').select('id').or('is_active.eq.true,voting_open.eq.true')
    if (mErr) throw new Error(mErr.message)

    const ids = (activeMatches ?? []).map(m => m.id as string)
    if (ids.length === 0) return {}

    const { data: votes, error: vErr } = await supabase
      .from('votes').select('match_id, side, amount').in('match_id', ids)
    if (vErr) throw new Error(vErr.message)

    // getLiveStandings only reads side + amount, so userId is left empty.
    const byMatch = new Map<string, VoteEntry[]>()
    for (const id of ids) byMatch.set(id, [])
    for (const v of votes ?? []) {
      byMatch.get(v.match_id as string)?.push({
        userId: '',
        botChoice: v.side === 'left' ? 'A' : 'B',
        amount: v.amount as number,
      })
    }

    const out: Record<string, VoteStandings> = {}
    for (const [id, entries] of byMatch) {
      const s = getLiveStandings(entries)
      const total = s.totalPool
      const noData = total === 0
      out[id] = {
        poolLeft: s.poolA,
        poolRight: s.poolB,
        totalPool: total,
        votesLeft:  entries.filter(e => e.botChoice === 'A').length,
        votesRight: entries.filter(e => e.botChoice === 'B').length,
        pctLeft:  noData ? 50 : Math.round((s.poolA / total) * 100),
        pctRight: noData ? 50 : Math.round((s.poolB / total) * 100),
        multiplierIfLeftWins:  s.multiplierIfAWins,
        multiplierIfRightWins: s.multiplierIfBWins,
        noData,
      }
    }
    return out
  },
  ['active-standings'],
  { revalidate: 2 },
)

// GET /api/standings — { [matchId]: VoteStandings } for all active matches.
export async function GET() {
  try {
    return NextResponse.json(await getActiveStandings())
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load standings' },
      { status: 500 },
    )
  }
}
