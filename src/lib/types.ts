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
  winner_side: 'left' | 'right' | null
  status: 'open' | 'closed' | 'resolved'
  betting_closes_at: string | null
  resolved_at: string | null
  created_at: string
}

export interface Bet {
  id: string
  match_id: string
  side: 'left' | 'right'
  amount: number
  payout: number | null
  refunded: boolean
  // Client-side only, derived from match data
  botName?: string
}

export interface OddsData {
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
  bets: Bet[]
}
