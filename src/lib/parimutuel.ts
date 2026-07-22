export type BotChoice = 'A' | 'B'

export interface Bet {
  userId: string
  botChoice: BotChoice
  amount: number
}

export interface PayoutResult {
  userId: string
  botChoice: BotChoice
  amount: number
  payout: number
  multiplier: number
  refunded: boolean
}

export interface RoundResolution {
  winner: BotChoice | 'REFUND'
  poolA: number
  poolB: number
  totalPool: number
  payoutPool: number
  rakeTaken: number
  payouts: PayoutResult[]
}

export function getPools(bets: Bet[]): { poolA: number; poolB: number; totalPool: number } {
  let poolA = 0
  let poolB = 0
  for (const b of bets) {
    if (b.botChoice === 'A') poolA += b.amount
    else poolB += b.amount
  }
  return { poolA, poolB, totalPool: poolA + poolB }
}

export function getLiveOdds(bets: Bet[], rake = 0) {
  const { poolA, poolB, totalPool } = getPools(bets)
  const payoutPool = totalPool * (1 - rake)
  return {
    poolA,
    poolB,
    totalPool,
    multiplierIfAWins: poolA > 0 ? round2(payoutPool / poolA) : null,
    multiplierIfBWins: poolB > 0 ? round2(payoutPool / poolB) : null,
  }
}

export function resolveRound(bets: Bet[], winner: BotChoice, rake = 0): RoundResolution {
  if (rake < 0 || rake >= 1) throw new Error('rake must be in [0, 1)')

  const { poolA, poolB, totalPool } = getPools(bets)
  const winningPool = winner === 'A' ? poolA : poolB

  if (winningPool === 0) {
    return {
      winner: 'REFUND',
      poolA, poolB, totalPool,
      payoutPool: totalPool,
      rakeTaken: 0,
      payouts: bets.map(b => ({
        userId: b.userId, botChoice: b.botChoice, amount: b.amount,
        payout: b.amount, multiplier: 1, refunded: true,
      })),
    }
  }

  const payoutPool = totalPool * (1 - rake)
  const rakeTaken = totalPool - payoutPool
  const payoutPerToken = payoutPool / winningPool

  return {
    winner,
    poolA, poolB, totalPool,
    payoutPool: round2(payoutPool),
    rakeTaken: round2(rakeTaken),
    payouts: bets.map(b => {
      const won = b.botChoice === winner
      const payout = won ? round2(b.amount * payoutPerToken) : 0
      return {
        userId: b.userId, botChoice: b.botChoice, amount: b.amount,
        payout, multiplier: won ? round2(payoutPerToken) : 0, refunded: false,
      }
    }),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
