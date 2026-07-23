import { NextResponse } from 'next/server'
import supabase from '@/lib/supabase'
import { getLiveStandings } from '@/lib/vote-pool'
import type { VoteEntry } from '@/lib/vote-pool'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: matchId } = await params

  const { data: votes, error } = await supabase
    .from('votes').select('user_id, side, amount').eq('match_id', matchId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries: VoteEntry[] = (votes ?? []).map(v => ({
    userId: v.user_id,
    botChoice: v.side === 'left' ? 'A' : 'B',
    amount: v.amount,
  }))

  const standings = getLiveStandings(entries)
  const total = standings.totalPool
  const noData = total === 0

  const votesLeft  = (votes ?? []).filter(v => v.side === 'left').length
  const votesRight = (votes ?? []).filter(v => v.side === 'right').length

  return NextResponse.json({
    poolLeft: standings.poolA,
    poolRight: standings.poolB,
    totalPool: total,
    votesLeft,
    votesRight,
    pctLeft:  noData ? 50 : Math.round(standings.poolA / total * 100),
    pctRight: noData ? 50 : Math.round(standings.poolB / total * 100),
    multiplierIfLeftWins:  standings.multiplierIfAWins,
    multiplierIfRightWins: standings.multiplierIfBWins,
    noData,
  })
}
