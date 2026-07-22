/**
 * Pari-mutuel voting engine for sumobots rounds.
 *
 * Model: two robots (A, B) fight in a round. Users stake tokens on one side.
 * When the round resolves, the losing pool is redistributed to the winning
 * pool proportionally to each winner's stake, minus an optional rake.
 *
 * This is intentionally backend-agnostic (no DB calls inside) — pass in
 * plain data, get plain results back, then persist however you like
 * (Supabase, Postgres, etc).
 */

export type BotChoice = "A" | "B";

export interface Bet {
  userId: string;
  botChoice: BotChoice;
  amount: number; // tokens staked, must be a positive integer
}

export interface PayoutResult {
  userId: string;
  botChoice: BotChoice;
  amount: number;      // original stake
  payout: number;      // tokens returned (0 if they lost)
  multiplier: number;  // payout / amount, for display ("you got 4.2x")
  refunded: boolean;   // true if this was a refund case, not a real payout
}

export interface RoundResolution {
  winner: BotChoice | "REFUND"; // REFUND = nobody bet on the winning side
  poolA: number;
  poolB: number;
  totalPool: number;
  payoutPool: number;   // totalPool after rake
  rakeTaken: number;
  payouts: PayoutResult[];
}

/**
 * Sum a list of bets into pool totals. Useful for live odds display
 * while betting is still open.
 */
export function getPools(bets: Bet[]): { poolA: number; poolB: number; totalPool: number } {
  let poolA = 0;
  let poolB = 0;
  for (const b of bets) {
    if (b.botChoice === "A") poolA += b.amount;
    else poolB += b.amount;
  }
  return { poolA, poolB, totalPool: poolA + poolB };
}

/**
 * Live, pre-resolution implied multipliers — what a bettor would get
 * *right now* if that bot wins. Will drift as more bets come in.
 * Returns null for a side if its pool is empty (multiplier undefined yet).
 */
export function getLiveOdds(bets: Bet[], rake = 0) {
  const { poolA, poolB, totalPool } = getPools(bets);
  const payoutPool = totalPool * (1 - rake);

  return {
    poolA,
    poolB,
    totalPool,
    multiplierIfAWins: poolA > 0 ? round2(payoutPool / poolA) : null,
    multiplierIfBWins: poolB > 0 ? round2(payoutPool / poolB) : null,
  };
}

/**
 * Resolve a round: given all bets and the winning bot, compute payouts.
 *
 * @param bets   every bet placed this round
 * @param winner which bot actually won
 * @param rake   fraction taken by the platform, e.g. 0.05 for 5%. Default 0.
 */
export function resolveRound(bets: Bet[], winner: BotChoice, rake = 0): RoundResolution {
  if (rake < 0 || rake >= 1) throw new Error("rake must be in [0, 1)");

  const { poolA, poolB, totalPool } = getPools(bets);
  const winningPool = winner === "A" ? poolA : poolB;

  // Nobody bet on the side that won -> can't compute a payout ratio.
  // Refund everyone rather than inventing a payout.
  if (winningPool === 0) {
    const payouts: PayoutResult[] = bets.map((b) => ({
      userId: b.userId,
      botChoice: b.botChoice,
      amount: b.amount,
      payout: b.amount,
      multiplier: 1,
      refunded: true,
    }));

    return {
      winner: "REFUND",
      poolA,
      poolB,
      totalPool,
      payoutPool: totalPool,
      rakeTaken: 0,
      payouts,
    };
  }

  const payoutPool = totalPool * (1 - rake);
  const rakeTaken = totalPool - payoutPool;
  const payoutPerToken = payoutPool / winningPool;

  const payouts: PayoutResult[] = bets.map((b) => {
    const won = b.botChoice === winner;
    const payout = won ? round2(b.amount * payoutPerToken) : 0;
    return {
      userId: b.userId,
      botChoice: b.botChoice,
      amount: b.amount,
      payout,
      multiplier: won ? round2(payoutPerToken) : 0,
      refunded: false,
    };
  });

  return {
    winner,
    poolA,
    poolB,
    totalPool,
    payoutPool: round2(payoutPool),
    rakeTaken: round2(rakeTaken),
    payouts,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------
// Example usage / sanity check
// ---------------------------------------------------------------------
if (require.main === module) {
  const bets: Bet[] = [
    { userId: "u1", botChoice: "A", amount: 500 },
    { userId: "u2", botChoice: "A", amount: 400 },
    { userId: "u3", botChoice: "B", amount: 60 },
    { userId: "u4", botChoice: "B", amount: 40 },
  ];

  console.log("Live odds:", getLiveOdds(bets, 0.05));
  console.log("If B wins:", resolveRound(bets, "B", 0.05));
  console.log("If A wins:", resolveRound(bets, "A", 0.05));
}
