import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { isAdminUser } from '@/lib/auth'
import supabase from '@/lib/supabase'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!isAdminUser(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: matchId } = await params
  const body = await req.json()
  const { status } = body

  if (!['open', 'closed'].includes(status))
    return NextResponse.json({ error: 'status must be "open" or "closed"' }, { status: 400 })

  const { data: match } = await supabase
    .from('matches').select('id, status').eq('id', matchId).single()
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (match.status === 'resolved')
    return NextResponse.json({ error: 'Cannot reopen a resolved match' }, { status: 400 })

  const { error } = await supabase
    .from('matches').update({ status }).eq('id', matchId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ matchId, status })
}
