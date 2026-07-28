import { NextResponse } from 'next/server'
import supabase from '@/lib/supabase'
import { getBracketState } from '@/lib/db/bracket'
import { wildcardTeamNames } from '@/lib/mock-data'

export async function GET() {
  const [{ data, error }, bracket] = await Promise.all([
    supabase.from('matches').select('*').order('created_at', { ascending: false }),
    getBracketState(),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Which teams came in as wildcards — the bidding screen gives them a halo.
  // Read per division, since each bracket has its own wildcard boxes and a
  // name could in principle appear in both.
  const wildcardStandards = wildcardTeamNames(bracket.matches.filter(m => m.division === 'standards'))
  const wildcardOpen = wildcardTeamNames(bracket.matches.filter(m => m.division === 'open'))
  const isWildcard = (compType: string, name: string) =>
    compType === 'standard' ? wildcardStandards.has(name)
    : compType === 'open'   ? wildcardOpen.has(name)
    // bossbot / exhibition aren't in a division bracket — accept either.
    : wildcardStandards.has(name) || wildcardOpen.has(name)

  return NextResponse.json({
    matches: (data ?? []).map(m => ({
      ...m,
      left_wildcard:  isWildcard(m.comp_type as string, m.left_name as string),
      right_wildcard: isWildcard(m.comp_type as string, m.right_name as string),
    })),
    // How many physical rings each division is running. The bidding page shows
    // one ring slot per ring (the schedule makes at most one match active per
    // ring), so every live match is biddable and an idle ring still shows its
    // "TBD" placeholder. Keyed by comp_type, matching the match rows.
    ringCounts: {
      standard: bracket.schedules.standards.concurrentRings,
      open:     bracket.schedules.open.concurrentRings,
    },
  })
}
