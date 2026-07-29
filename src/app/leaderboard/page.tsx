import { getLeaderboard } from '@/lib/db/leaderboard'
import { getTeamsLeaderboard } from '@/lib/db/teamsLeaderboard'
import LeaderboardPage from '@/components/LeaderboardPage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  // Both boards are fetched up front so the Players/Teams toggle is instant —
  // it's a client-side switch, not a navigation.
  const [players, teams] = await Promise.all([getLeaderboard(), getTeamsLeaderboard()])
  // Registered teams that never made it into a bracket — status 'unentered',
  // labelled "Not Drawn" (see buildEntry in db/teamsLeaderboard) — are left off
  // the public board: they hold no slot in either draw, so they have no matches,
  // no record and nothing to bet on, and they outnumber the teams actually
  // playing. Filtered here rather than inside getTeamsLeaderboard so the OBS
  // stats overlay still reads the full set.
  const drawnTeams = teams.filter(t => t.status !== 'unentered')
  // Live updates are driven from inside LeaderboardPage via useRealtimeRefresh
  // (subscribed to the game tables only, so standings move after each game
  // rather than on every bet). Both fetches are cached and invalidated on save.
  return <LeaderboardPage players={players} teams={drawnTeams} />
}
