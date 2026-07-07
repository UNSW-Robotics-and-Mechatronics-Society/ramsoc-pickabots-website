import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import supabase from '@/lib/supabase'

const MAX_BET = 50

// GET /api/bets — the signed-in user's bets
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bets').select('id, match_id, side, amount').eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/bets — place a bet
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { match_id, side, amount } = body

  if (!match_id || !side || !amount)
    return NextResponse.json({ error: 'match_id, side and amount are required' }, { status: 400 })
  if (!['left', 'right'].includes(side))
    return NextResponse.json({ error: 'side must be "left" or "right"' }, { status: 400 })
  if (amount < 1 || amount > MAX_BET)
    return NextResponse.json({ error: `Amount must be 1–${MAX_BET}` }, { status: 400 })

  // Match must exist and be active
  const { data: match } = await supabase
    .from('matches').select('id, is_active').eq('id', match_id).single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (!match.is_active) return NextResponse.json({ error: 'Match is not accepting bets' }, { status: 400 })

  // One bet per user per match
  const { data: existing } = await supabase
    .from('bets').select('id').eq('user_id', userId).eq('match_id', match_id).maybeSingle()

  if (existing) return NextResponse.json({ error: 'Already bet on this match' }, { status: 409 })

  // Check token balance
  const { data: user } = await supabase.from('users').select('tokens').eq('id', userId).single()
  if (!user || user.tokens < amount)
    return NextResponse.json({ error: 'Not enough tokens' }, { status: 400 })

  // Deduct tokens
  const { error: deductErr } = await supabase
    .from('users').update({ tokens: user.tokens - amount }).eq('id', userId)
  if (deductErr) return NextResponse.json({ error: deductErr.message }, { status: 500 })

  // Insert bet
  const { data: bet, error: betErr } = await supabase
    .from('bets').insert({ user_id: userId, match_id, side, amount }).select().single()

  if (betErr) {
    // Refund on failure
    await supabase.from('users').update({ tokens: user.tokens }).eq('id', userId)
    return NextResponse.json({ error: betErr.message }, { status: 500 })
  }

  return NextResponse.json({ bet, tokens: user.tokens - amount }, { status: 201 })
}

// DELETE /api/bets?bet_id=xxx — undo a bet
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const betId = req.nextUrl.searchParams.get('bet_id')
  if (!betId) return NextResponse.json({ error: 'bet_id is required' }, { status: 400 })

  // Fetch bet (must belong to this user)
  const { data: bet } = await supabase
    .from('bets').select('id, amount, match_id').eq('id', betId).eq('user_id', userId).single()

  if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

  // Confirm match still active
  const { data: match } = await supabase
    .from('matches').select('is_active').eq('id', bet.match_id).single()

  if (!match?.is_active)
    return NextResponse.json({ error: 'Cannot undo — match already resolved' }, { status: 400 })

  // Delete and refund
  await supabase.from('bets').delete().eq('id', betId)

  const { data: user } = await supabase.from('users').select('tokens').eq('id', userId).single()
  const newTokens = (user?.tokens ?? 0) + bet.amount
  await supabase.from('users').update({ tokens: newTokens }).eq('id', userId)

  return NextResponse.json({ tokens: newTokens })
}
