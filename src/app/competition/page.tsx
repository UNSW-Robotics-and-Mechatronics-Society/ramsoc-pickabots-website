import { getBracketState } from '@/lib/db/bracket'
import BracketPage from '@/components/BracketPage'
import RealtimeRefresh from '@/components/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function CompetitionPage() {
  const { matches, teamCount, schedules } = await getBracketState()
  return (
    <>
      <BracketPage matches={matches} teamCount={teamCount} schedules={schedules} />
      <RealtimeRefresh tables={['bracket_matches', 'bracket_config', 'bracket_schedule']} />
    </>
  )
}
