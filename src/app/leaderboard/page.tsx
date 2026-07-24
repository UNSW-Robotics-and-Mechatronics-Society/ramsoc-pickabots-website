import { getLeaderboard } from '@/lib/db/leaderboard'
import LeaderboardPage from '@/components/LeaderboardPage'
import RealtimeRefresh from '@/components/RealtimeRefresh'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const players = await getLeaderboard()
  return (
    <>
      <LeaderboardPage players={players} />
      {/* Standings shift when matches resolve (winner_side), votes settle
          (votes.payout), and — critically — when the payout credits land on
          users.tokens, which is the value this page actually ranks by and the
          last write rewardWinners() makes. */}
      <RealtimeRefresh tables={['matches', 'votes', 'users']} />
    </>
  )
}
