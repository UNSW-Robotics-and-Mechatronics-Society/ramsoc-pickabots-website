import { getBracketState } from '@/lib/db/bracket'
import { getFinalsDay } from '@/lib/db/config'
import BracketPage from '@/components/BracketPage'

export const dynamic = 'force-dynamic'

export default async function CompetitionPage() {
  const [{ matches, teamCounts, schedules }, finalsDay] = await Promise.all([getBracketState(), getFinalsDay()])
  // Live updates are driven from inside BracketPage via useRealtimeRefresh
  // (subscribed to the bracket tables). getBracketState is cached and
  // invalidated on save.
  return <BracketPage matches={matches} teamCounts={teamCounts} schedules={schedules} finalsDay={finalsDay} />
}
