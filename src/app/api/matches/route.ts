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

  // Finals Day rows, tagged so the bidding page can pull them into their own
  // tab and label each with its round. The voting table has no side column —
  // its rows only know a comp_type — so this is derived from the bracket match
  // behind each row rather than stored, which also keeps it free of a migration.
  // `finals_order` is the position on the Finals Day ring, so the cards list in
  // running order instead of by row creation.
  const finalsOrder = new Map(
    bracket.finalsSchedule.rings.flat().map((e, i) => [e.matchId, i]),
  );
  const finalsLabel = (side: string, matchNumber: number) =>
    side === 'finals-semi'  ? `Semi ${matchNumber}` :
    side === 'finals-third' ? 'Bronze' :
    side === 'finals-final' ? 'Final'  : null;
  const finalsById = new Map(
    bracket.matches
      .map(m => [m.id, finalsLabel(m.side, m.matchNumber)] as const)
      .filter((e): e is readonly [string, string] => e[1] !== null),
  );

  return NextResponse.json({
    matches: (data ?? []).map(m => {
      const label = m.bracket_match_id ? finalsById.get(m.bracket_match_id as string) : undefined;
      return {
        ...m,
        left_wildcard:  isWildcard(m.comp_type as string, m.left_name as string),
        right_wildcard: isWildcard(m.comp_type as string, m.right_name as string),
        ...(label
          ? {
              is_finals: true,
              finals_label: label,
              finals_order: finalsOrder.get(m.bracket_match_id as string) ?? 0,
            }
          : {}),
      };
    }),
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
