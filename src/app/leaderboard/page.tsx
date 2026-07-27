import { getLeaderboard } from '@/lib/db/leaderboard'
import { getTeamsLeaderboard } from '@/lib/db/teamsLeaderboard'
import LeaderboardPage from '@/components/LeaderboardPage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  // Both boards are fetched up front so the Players/Teams toggle is instant —
  // it's a client-side switch, not a navigation.
  const [players, teams] = await Promise.all([getLeaderboard(), getTeamsLeaderboard()])
  // Live updates are driven from inside LeaderboardPage via useRealtimeRefresh
  // (subscribed to the game tables only, so standings move after each game
  // rather than on every bet). Both fetches are cached and invalidated on save.
  return <LeaderboardPage players={players} teams={teams} />
}
