import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { isAdminUser } from '@/lib/auth'
import supabase from '@/lib/supabase'
import { resolveRound } from '@/lib/parimutuel'
import type { Bet } from '@/lib/parimutuel'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!isAdminUser(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: matchId } = await params
  const { winner_side } = await req.json()

  if (!['left', 'right'].includes(winner_side))
    return NextResponse.json({ error: 'winner_side must be "left" or "right"' }, { status: 400 })

  const { data: match } = await supabase
    .from('matches').select('id, status').eq('id', matchId).single()
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (match.status === 'resolved')
    return NextResponse.json({ error: 'Match already resolved' }, { status: 400 })

  const { data: bets, error: betsErr } = await supabase
    .from('bets').select('id, user_id, side, amount').eq('match_id', matchId)
  if (betsErr) return NextResponse.json({ error: betsErr.message }, { status: 500 })

  const parimutuelBets: Bet[] = (bets ?? []).map(b => ({
    userId: b.user_id,
    botChoice: b.side === 'left' ? 'A' : 'B',
    amount: b.amount,
  }))

  const resolution = resolveRound(parimutuelBets, winner_side === 'left' ? 'A' : 'B')

  // Write payouts to bet rows and credit users
  const payoutMap = new Map(resolution.payouts.map((p, i) => [bets![i].id, p]))

  for (const bet of bets ?? []) {
    const result = payoutMap.get(bet.id)
    if (!result) continue

    await supabase.from('bets').update({
      payout: result.payout,
      refunded: result.refunded,
    }).eq('id', bet.id)

    if (result.payout > 0) {
      const { data: u } = await supabase.from('users').select('tokens').eq('id', bet.user_id).single()
      if (u) {
        await supabase.from('users').update({ tokens: u.tokens + result.payout }).eq('id', bet.user_id)
      }
    }
  }

  await supabase.from('matches').update({
    winner_side,
    status: 'resolved',
    resolved_at: new Date().toISOString(),
    is_active: false,
  }).eq('id', matchId)

  return NextResponse.json({ resolution })
}
