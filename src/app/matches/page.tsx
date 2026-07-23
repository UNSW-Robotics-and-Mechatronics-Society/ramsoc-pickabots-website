import { getBracketState } from '@/lib/db/bracket'
import MatchList from '@/components/MatchList'
import RealtimeRefresh from '@/components/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function MatchesPage() {
  const { matches, teamCount, schedules, exhibitionSchedule } = await getBracketState()
  return (
    <>
      <MatchList matches={matches} teamCount={teamCount} schedules={schedules} exhibitionSchedule={exhibitionSchedule} />
      <RealtimeRefresh tables={['bracket_matches', 'bracket_schedule']} />
    </>
  )
}
