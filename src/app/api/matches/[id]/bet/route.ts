import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import supabase from '@/lib/supabase'

const MAX_BET_PER_ROUND = 500

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: matchId } = await params
  const { side, amount } = await req.json()

  if (!['left', 'right'].includes(side))
    return NextResponse.json({ error: 'side must be "left" or "right"' }, { status: 400 })
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_BET_PER_ROUND)
    return NextResponse.json({ error: `Amount must be 1–${MAX_BET_PER_ROUND}` }, { status: 400 })

  const { data: match } = await supabase
    .from('matches').select('id, status, betting_closes_at').eq('id', matchId).single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (match.status !== 'open')
    return NextResponse.json({ error: 'Betting is closed for this match' }, { status: 400 })
  if (match.betting_closes_at && new Date(match.betting_closes_at) < new Date())
    return NextResponse.json({ error: 'Betting window has passed' }, { status: 400 })

  const { data: existing } = await supabase
    .from('bets').select('id').eq('user_id', userId).eq('match_id', matchId).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already bet on this match' }, { status: 409 })

  const { data: user } = await supabase.from('users').select('tokens').eq('id', userId).single()
  if (!user || user.tokens < amount)
    return NextResponse.json({ error: 'Not enough tokens' }, { status: 400 })

  const { error: deductErr } = await supabase
    .from('users').update({ tokens: user.tokens - amount }).eq('id', userId)
  if (deductErr) return NextResponse.json({ error: deductErr.message }, { status: 500 })

  const { data: bet, error: betErr } = await supabase
    .from('bets').insert({ user_id: userId, match_id: matchId, side, amount }).select().single()

  if (betErr) {
    await supabase.from('users').update({ tokens: user.tokens }).eq('id', userId)
    return NextResponse.json({ error: betErr.message }, { status: 500 })
  }

  return NextResponse.json({ bet, tokens: user.tokens - amount }, { status: 201 })
}
