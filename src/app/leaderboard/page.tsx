import { getLeaderboard } from '@/lib/db/leaderboard'
import LeaderboardPage from '@/components/LeaderboardPage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const players = await getLeaderboard()
  return <LeaderboardPage players={players} />
}
