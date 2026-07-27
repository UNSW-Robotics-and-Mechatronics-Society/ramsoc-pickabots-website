export type CompType = 'standard' | 'open' | 'bossbot'

export interface Match {
  id: string
  comp_type: CompType
  is_bossbot: boolean
  left_name: string
  left_color: string
  left_shape: string
  right_name: string
  right_color: string
  right_shape: string
  is_active: boolean
  voting_open: boolean
  // Set by reconcileVotingMatches() from the bracket match's own
  // side === 'exhibition' — an ad-hoc match, kept out of the Standard/Open
  // tabs and shown under its own Exhibition tab instead.
  is_exhibition: boolean
  winner_side: 'left' | 'right' | null
  created_at: string
  // Set by /api/matches from the bracket's wildcard boxes — a team brought back
  // from elimination. Drives the halo over its robot on the bidding screen.
  left_wildcard?: boolean
  right_wildcard?: boolean
}

export interface Vote {
  id: string
  match_id: string
  side: 'left' | 'right'
  amount: number
  // Client-side only, derived from match data
  botName?: string
  // Client-side only: true if this vote staked the player's entire balance
  // (an "all in" bet). Drives the gold/confetti win screen. Set when the vote
  // is placed this session — not persisted, so it's lost on a full reload.
  allIn?: boolean
}

export interface VoteStandings {
  poolLeft: number
  poolRight: number
  totalPool: number
  votesLeft: number
  votesRight: number
  pctLeft: number
  pctRight: number
  multiplierIfLeftWins: number | null
  multiplierIfRightWins: number | null
  noData: boolean
}

export interface UserData {
  tokens: number
  votes: Vote[]
}

// ── Teams leaderboard ────────────────────────────────────────────────────────
// Lives here rather than in lib/db/teamsLeaderboard.ts (which is server-only)
// so the client board can import the shape without pulling in the query.

/**
 * Where a team stands in its double-elim run.
 *  winners  — undefeated, still in the winners bracket
 *  losers   — one loss, alive in the losers bracket
 *  champion / runner-up — decided by the Grand Final
 *  knocked-out — the second loss ended them; the label is that round
 *  wildcard — was knocked out, brought back through a wildcard box, still alive
 *  special  — never enters a bracket, so it has no run to be in
 *  unentered — a team row that hasn't been drawn into the bracket yet
 */
export type TeamStatusKind =
  | 'champion'
  | 'runner-up'
  | 'winners'
  | 'losers'
  | 'knocked-out'
  | 'wildcard'
  | 'special'
  | 'unentered'

export interface TeamLeaderboardEntry {
  id: string
  name: string
  kind: 'regular' | 'special'
  division: 'standards' | 'open' | null // regular teams only
  category: string | null               // special teams only
  tokens: number                        // total RamCoins bet on this team, win or lose
  wins: number
  losses: number
  winRate: number
  status: TeamStatusKind
  statusLabel: string
  eliminated: boolean                   // knocked out → greyed, sunk to the bottom
}
