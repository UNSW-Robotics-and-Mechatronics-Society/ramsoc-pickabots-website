import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import supabase from '@/lib/supabase'

const MAX_VOTE_FRAC = 0.5

// GET /api/votes — the signed-in user's votes
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('votes').select('id, match_id, side, amount').eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/votes — place a vote
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { match_id, side, amount } = body

  if (!match_id || !side || !amount)
    return NextResponse.json({ error: 'match_id, side and amount are required' }, { status: 400 })
  if (!['left', 'right'].includes(side))
    return NextResponse.json({ error: 'side must be "left" or "right"' }, { status: 400 })
  if (amount < 1 || !Number.isInteger(amount))
    return NextResponse.json({ error: 'Amount must be a positive whole number' }, { status: 400 })

  // Match must exist and be live
  const { data: match } = await supabase
    .from('matches').select('id, is_active, voting_open').eq('id', match_id).single()

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (!match.is_active) return NextResponse.json({ error: 'Match is not accepting votes' }, { status: 400 })
  if (match.voting_open === false) return NextResponse.json({ error: 'Voting is closed for this match' }, { status: 400 })

  // One vote per user per match
  const { data: existing } = await supabase
    .from('votes').select('id').eq('user_id', userId).eq('match_id', match_id).maybeSingle()

  if (existing) return NextResponse.json({ error: 'Already voted on this match' }, { status: 409 })

  // Check token balance (limit(1) tolerates duplicate rows; real fix: add PK to users table)
  const { data: userRows } = await supabase.from('users').select('tokens').eq('id', userId).limit(1)
  const user = userRows?.[0] ?? null
  if (!user || user.tokens < amount)
    return NextResponse.json({ error: 'Not enough tokens' }, { status: 400 })
  const maxAllowed = Math.floor(user.tokens * MAX_VOTE_FRAC)
  if (amount > maxAllowed)
    return NextResponse.json({ error: `Max vote is 50% of your balance (${maxAllowed} tokens)` }, { status: 400 })

  // Deduct tokens
  const { error: deductErr } = await supabase
    .from('users').update({ tokens: user.tokens - amount }).eq('id', userId)
  if (deductErr) return NextResponse.json({ error: deductErr.message }, { status: 500 })

  // Insert vote
  const { data: vote, error: voteErr } = await supabase
    .from('votes').insert({ user_id: userId, match_id, side, amount }).select().single()

  if (voteErr) {
    // Refund on failure
    await supabase.from('users').update({ tokens: user.tokens }).eq('id', userId)
    return NextResponse.json({ error: voteErr.message }, { status: 500 })
  }

  return NextResponse.json({ vote, tokens: user.tokens - amount }, { status: 201 })
}

// DELETE /api/votes?vote_id=xxx — undo a vote
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const voteId = req.nextUrl.searchParams.get('vote_id')
  if (!voteId) return NextResponse.json({ error: 'vote_id is required' }, { status: 400 })

  // Fetch vote (must belong to this user)
  const { data: vote } = await supabase
    .from('votes').select('id, amount, match_id').eq('id', voteId).eq('user_id', userId).single()

  if (!vote) return NextResponse.json({ error: 'Vote not found' }, { status: 404 })

  // Confirm match still active AND voting still open — once voting is
  // locked, votes are final and can't be undone.
  const { data: match } = await supabase
    .from('matches').select('is_active, voting_open, winner_side').eq('id', vote.match_id).single()

  if (!match?.is_active || match.winner_side !== null)
    return NextResponse.json({ error: 'Cannot undo — match already resolved' }, { status: 400 })
  if (match.voting_open === false)
    return NextResponse.json({ error: 'Cannot undo — voting is closed and votes are locked in' }, { status: 400 })

  // Delete and refund
  await supabase.from('votes').delete().eq('id', voteId)

  const { data: userRows2 } = await supabase.from('users').select('tokens').eq('id', userId).limit(1)
  const newTokens = (userRows2?.[0]?.tokens ?? 0) + vote.amount
  await supabase.from('users').update({ tokens: newTokens }).eq('id', userId)

  return NextResponse.json({ tokens: newTokens })
}
