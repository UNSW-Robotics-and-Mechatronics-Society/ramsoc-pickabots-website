import { getLeaderboard } from '@/lib/db/leaderboard'
import LeaderboardPage from '@/components/LeaderboardPage'
import RealtimeRefresh from '@/components/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const players = await getLeaderboard()
  return (
    <>
      <LeaderboardPage players={players} />
      {/* Standings shift when matches resolve (winner_side) and payouts land (votes.payout). */}
      <RealtimeRefresh tables={['matches', 'votes']} />
    </>
  )
}
