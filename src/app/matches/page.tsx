import { getBracketState } from '@/lib/db/bracket'
import MatchList from '@/components/MatchList'

export const dynamic = 'force-dynamic'

export default async function MatchesPage() {
  const { matches, teamCount, schedules } = await getBracketState()
  return <MatchList matches={matches} teamCount={teamCount} schedules={schedules} />
}
