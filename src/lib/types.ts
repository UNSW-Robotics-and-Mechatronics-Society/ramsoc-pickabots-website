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
  winner_side: 'left' | 'right' | null
  created_at: string
}

export interface Vote {
  id: string
  match_id: string
  side: 'left' | 'right'
  amount: number
  // Client-side only, derived from match data
  botName?: string
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
