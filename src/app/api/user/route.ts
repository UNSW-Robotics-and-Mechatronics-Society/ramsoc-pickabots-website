import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import supabase from '@/lib/supabase'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try to fetch existing user (limit(1) tolerates duplicate rows)
  const { data: userRows, error: selectErr } = await supabase
    .from('users').select('tokens').eq('id', userId).limit(1)
  const user = userRows?.[0] ?? null
  console.log('[GET /api/user] select userId:', userId, 'rows:', userRows, 'err:', selectErr)

  if (selectErr) {
    console.error('[GET /api/user] select failed:', selectErr)
    return NextResponse.json({ tokens: 100, _supabaseError: selectErr.message })
  }

  if (!user) {
    const clerkUser = await currentUser()
    const displayName = clerkUser?.fullName || clerkUser?.username || 'Anonymous Pilot'
    console.log('[GET /api/user] no row found, inserting userId:', userId)

    // Try with display_name first; fall back without it if column doesn't exist yet
    let { error: insertErr } = await supabase
      .from('users').insert({ id: userId, tokens: 100, display_name: displayName })
    console.log('[GET /api/user] insert w/ display_name result:', insertErr ?? 'ok')
    if (insertErr?.message?.includes('display_name')) {
      ;({ error: insertErr } = await supabase
        .from('users').insert({ id: userId, tokens: 100 }))
      console.log('[GET /api/user] insert without display_name result:', insertErr ?? 'ok')
    }
    if (insertErr) {
      console.error('[GET /api/user] insert failed:', insertErr)
      return NextResponse.json({ tokens: 100, _supabaseError: insertErr.message })
    }
    return NextResponse.json({ tokens: 100 })
  }

  return NextResponse.json({ tokens: user.tokens })
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
