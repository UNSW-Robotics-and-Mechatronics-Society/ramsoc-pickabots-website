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

// Maps a coded exception raised by the place_vote/undo_vote SQL functions to an
// HTTP status + human message. Anything unrecognised is a 500.
function mapVoteError(message: string): { status: number; error: string } {
  if (message.includes('ALREADY_VOTED'))       return { status: 409, error: 'Already voted on this match' }
  if (message.includes('INSUFFICIENT_TOKENS')) return { status: 400, error: 'Not enough tokens' }
  if (message.includes('EXCEEDS_MAX'))         return { status: 400, error: `Max vote is ${MAX_VOTE_FRAC * 100}% of your balance` }
  if (message.includes('VOTING_CLOSED'))       return { status: 400, error: 'Voting is closed for this match' }
  if (message.includes('MATCH_INACTIVE'))      return { status: 400, error: 'Match is not accepting votes' }
  if (message.includes('MATCH_NOT_FOUND'))     return { status: 404, error: 'Match not found' }
  if (message.includes('NO_USER'))             return { status: 400, error: 'Not enough tokens' }
  if (message.includes('MATCH_RESOLVED'))      return { status: 400, error: 'Cannot undo — match already resolved' }
  if (message.includes('VOTE_NOT_FOUND'))      return { status: 404, error: 'Vote not found' }
  return { status: 500, error: message }
}

// POST /api/votes — place a vote. All validation, token deduction, the vote
// row, and the pool update happen inside one transaction (place_vote), so
// concurrent submissions from the same user can't double-spend or double-vote.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { match_id, side, amount } = body

  if (!match_id || !side || !amount)
    return NextResponse.json({ error: 'match_id, side and amount are required' }, { status: 400 })
  if (!['left', 'right'].includes(side))
    return NextResponse.json({ error: 'side must be "left" or "right"' }, { status: 400 })
  if (amount < 1 || !Number.isInteger(amount))
    return NextResponse.json({ error: 'Amount must be a positive whole number' }, { status: 400 })

  const { data, error } = await supabase.rpc('place_vote', {
    p_user_id: userId,
    p_match_id: match_id,
    p_side: side,
    p_amount: amount,
  })

  if (error) {
    const mapped = mapVoteError(error.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const result = data as { tokens: number; vote_id: string }
  return NextResponse.json(
    { vote: { id: result.vote_id, match_id, side, amount }, tokens: result.tokens },
    { status: 201 },
  )
}

// DELETE /api/votes?vote_id=xxx — undo a vote. Delete + refund + pool reversal
// happen in one transaction (undo_vote).
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const voteId = req.nextUrl.searchParams.get('vote_id')
  if (!voteId) return NextResponse.json({ error: 'vote_id is required' }, { status: 400 })

  const { data, error } = await supabase.rpc('undo_vote', {
    p_user_id: userId,
    p_vote_id: voteId,
  })

  if (error) {
    const mapped = mapVoteError(error.message)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  return NextResponse.json({ tokens: data as number })
}
