export type BotChoice = 'A' | 'B'

export interface VoteEntry {
  userId: string
  botChoice: BotChoice
  amount: number
}

export interface RewardResult {
  userId: string
  botChoice: BotChoice
  amount: number
  reward: number
  multiplier: number
  refunded: boolean
}

export interface VoteRoundResult {
  winner: BotChoice | 'REFUND'
  poolA: number
  poolB: number
  totalPool: number
  rewardPool: number
  houseCutTaken: number
  rewards: RewardResult[]
}

export function getPools(entries: VoteEntry[]): { poolA: number; poolB: number; totalPool: number } {
  let poolA = 0
  let poolB = 0
  for (const e of entries) {
    if (e.botChoice === 'A') poolA += e.amount
    else poolB += e.amount
  }
  return { poolA, poolB, totalPool: poolA + poolB }
}

export function getLiveStandings(entries: VoteEntry[], houseCut = 0) {
  const { poolA, poolB, totalPool } = getPools(entries)
  const rewardPool = totalPool * (1 - houseCut)
  return {
    poolA,
    poolB,
    totalPool,
    multiplierIfAWins: poolA > 0 ? round2(rewardPool / poolA) : null,
    multiplierIfBWins: poolB > 0 ? round2(rewardPool / poolB) : null,
  }
}

export function resolveRound(entries: VoteEntry[], winner: BotChoice, houseCut = 0): VoteRoundResult {
  if (houseCut < 0 || houseCut >= 1) throw new Error('houseCut must be in [0, 1)')

  const { poolA, poolB, totalPool } = getPools(entries)
  const winningPool = winner === 'A' ? poolA : poolB

  if (winningPool === 0) {
    return {
      winner: 'REFUND',
      poolA, poolB, totalPool,
      rewardPool: totalPool,
      houseCutTaken: 0,
      rewards: entries.map(e => ({
        userId: e.userId, botChoice: e.botChoice, amount: e.amount,
        reward: e.amount, multiplier: 1, refunded: true,
      })),
    }
  }

  const rewardPool = totalPool * (1 - houseCut)
  const houseCutTaken = totalPool - rewardPool
  const rewardPerToken = rewardPool / winningPool

  return {
    winner,
    poolA, poolB, totalPool,
    rewardPool: round2(rewardPool),
    houseCutTaken: round2(houseCutTaken),
    rewards: entries.map(e => {
      const won = e.botChoice === winner
      const reward = won ? round2(e.amount * rewardPerToken) : 0
      return {
        userId: e.userId, botChoice: e.botChoice, amount: e.amount,
        reward, multiplier: won ? round2(rewardPerToken) : 0, refunded: false,
      }
    }),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Live standings straight from a match's denormalized pools ──────────────────
// Mirrors the /api/matches/[id]/standings computation exactly, but reads the
// pool_left/right + votes_left/right columns carried on the match row (pushed
// via Realtime) instead of re-reading every vote. houseCut is 0 (pari-mutuel:
// the whole pool is paid out to the winning side, split proportionally).
export function standingsFromMatch(m: {
  pool_left?: number
  pool_right?: number
  votes_left?: number
  votes_right?: number
}) {
  const poolLeft = m.pool_left ?? 0
  const poolRight = m.pool_right ?? 0
  const totalPool = poolLeft + poolRight
  const noData = totalPool === 0
  const rewardPool = totalPool // houseCut = 0
  return {
    poolLeft,
    poolRight,
    totalPool,
    votesLeft: m.votes_left ?? 0,
    votesRight: m.votes_right ?? 0,
    pctLeft: noData ? 50 : Math.round((poolLeft / totalPool) * 100),
    pctRight: noData ? 50 : Math.round((poolRight / totalPool) * 100),
    multiplierIfLeftWins: poolLeft > 0 ? round2(rewardPool / poolLeft) : null,
    multiplierIfRightWins: poolRight > 0 ? round2(rewardPool / poolRight) : null,
    noData,
  }
}
