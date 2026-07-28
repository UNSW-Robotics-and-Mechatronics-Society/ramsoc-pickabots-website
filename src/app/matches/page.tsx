import { getBracketState } from '@/lib/db/bracket'
import MatchList from '@/components/MatchList'

export const dynamic = 'force-dynamic'

export default async function MatchesPage() {
  const { matches, teamCounts, schedules, exhibitionSchedule } = await getBracketState()
  // Live updates are driven from inside MatchList via useRealtimeRefresh
  // (subscribed to the bracket tables). getBracketState is cached and
  // invalidated on save.
  return <MatchList matches={matches} teamCounts={teamCounts} schedules={schedules} exhibitionSchedule={exhibitionSchedule} />
}
