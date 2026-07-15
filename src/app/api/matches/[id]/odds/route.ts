import { NextResponse } from 'next/server'
import supabase from '@/lib/supabase'
import { getLiveOdds } from '@/lib/parimutuel'
import type { Bet } from '@/lib/parimutuel'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: matchId } = await params

  const { data: bets, error } = await supabase
    .from('bets').select('user_id, side, amount').eq('match_id', matchId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const parimutuelBets: Bet[] = (bets ?? []).map(b => ({
    userId: b.user_id,
    botChoice: b.side === 'left' ? 'A' : 'B',
    amount: b.amount,
  }))

  const odds = getLiveOdds(parimutuelBets)
  const total = odds.totalPool
  const noData = total === 0

  return NextResponse.json({
    poolLeft: odds.poolA,
    poolRight: odds.poolB,
    totalPool: total,
    pctLeft:  noData ? 50 : Math.round(odds.poolA / total * 100),
    pctRight: noData ? 50 : Math.round(odds.poolB / total * 100),
    multiplierIfLeftWins:  odds.multiplierIfAWins,
    multiplierIfRightWins: odds.multiplierIfBWins,
    noData,
  })
}
