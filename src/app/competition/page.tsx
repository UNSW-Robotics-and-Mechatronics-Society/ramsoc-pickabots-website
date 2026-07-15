import { getBracketState } from '@/lib/db/bracket'
import BracketPage from '@/components/BracketPage'

export const dynamic = 'force-dynamic'

export default async function CompetitionPage() {
  const { matches, teamCount, schedules } = await getBracketState()
  return <BracketPage matches={matches} teamCount={teamCount} schedules={schedules} />
}
