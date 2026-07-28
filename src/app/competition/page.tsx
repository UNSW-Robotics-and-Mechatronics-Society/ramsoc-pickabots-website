import { getBracketState } from '@/lib/db/bracket'
import BracketPage from '@/components/BracketPage'

export const dynamic = 'force-dynamic'

export default async function CompetitionPage() {
  const { matches, teamCounts, schedules } = await getBracketState()
  // Live updates are driven from inside BracketPage via useRealtimeRefresh
  // (subscribed to the bracket tables). getBracketState is cached and
  // invalidated on save.
  return <BracketPage matches={matches} teamCounts={teamCounts} schedules={schedules} />
}
