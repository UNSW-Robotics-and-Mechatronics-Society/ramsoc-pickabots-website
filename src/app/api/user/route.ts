import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import supabase from '@/lib/supabase'
import { getAllIn, getFinalsDay } from '@/lib/db/config'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ALL IN mode (admin toggle) lifts the 50%-of-balance vote cap. The client
  // uses this to size the vote slider; place_vote enforces it authoritatively.
  const allIn = await getAllIn()
  // Finals Day (admin toggle) — the voting page is client-only, so it reads the
  // flag here rather than via a server component like the other public pages.
  const finalsDay = await getFinalsDay()

  // Try to fetch existing user (limit(1) tolerates duplicate rows)
  const { data: userRows, error: selectErr } = await supabase
    .from('users').select('tokens').eq('id', userId).limit(1)
  const user = userRows?.[0] ?? null

  if (selectErr) {
    console.error('[GET /api/user] select failed:', selectErr)
    return NextResponse.json({ tokens: 100, allIn, finalsDay, _supabaseError: selectErr.message })
  }

  if (!user) {
    const clerkUser = await currentUser()
    const displayName = clerkUser?.fullName || clerkUser?.username || 'Anonymous Player'
    // Try with display_name first; fall back without it if column doesn't exist yet.
    // Upsert with ignoreDuplicates so a concurrent request (or place_vote, which
    // now provisions this row itself) racing us to create the same id is a no-op
    // instead of a duplicate-key error.
    let { error: insertErr } = await supabase
      .from('users').upsert({ id: userId, tokens: 100, display_name: displayName }, { onConflict: 'id', ignoreDuplicates: true })
    if (insertErr?.message?.includes('display_name')) {
      ;({ error: insertErr } = await supabase
        .from('users').upsert({ id: userId, tokens: 100 }, { onConflict: 'id', ignoreDuplicates: true }))
    }
    if (insertErr) {
      console.error('[GET /api/user] insert failed:', insertErr)
      return NextResponse.json({ tokens: 100, allIn, finalsDay, _supabaseError: insertErr.message })
    }
    return NextResponse.json({ tokens: 100, allIn, finalsDay })
  }

  return NextResponse.json({ tokens: user.tokens, allIn, finalsDay })
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tokens } = await req.json()
  if (typeof tokens !== 'number' || tokens < 0)
    return NextResponse.json({ error: 'Invalid tokens value' }, { status: 400 })

  const { error } = await supabase
    .from('users').update({ tokens }).eq('id', userId)

  if (error) {
    console.error('[PATCH /api/user] update failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tokens })
}
