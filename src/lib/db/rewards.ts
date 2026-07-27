import "server-only";
import supabase from "@/lib/supabase";
import { resolveRound } from "@/lib/vote-pool";
import type { VoteEntry } from "@/lib/vote-pool";

/**
 * Rewards all voters for a resolved match using resolveRound as the single
 * source of payout truth. Winners receive their proportional share of the
 * total pool. If nobody backed the winner, everyone is refunded their stake.
 * Rewards all voters for a resolved match.
 * Winners receive their proportional share of the total pool.
 * Losers lose their votes regardless — no refund even if nobody backed the winner.
 * Every vote's `payout` column is recorded (0 for losers) so the coin ledger
 * can read gain/loss straight off `votes` instead of re-deriving pool math.
 */
export async function rewardWinners(matchId: string, winnerSide: "left" | "right"): Promise<void> {
  const { data: rows, error: votesErr } = await supabase
    .from("votes")
    .select("id, user_id, side, amount")
    .eq("match_id", matchId);

  if (votesErr) {
    console.error("[rewardWinners] failed to query votes for match", matchId, votesErr.message);
    throw votesErr;
  }
  if (!rows || rows.length === 0) {
    console.warn("[rewardWinners] no votes found for match", matchId, "— skipping payout. If this is unexpected, check the DB migration (bets → votes table rename).");
    return;
  }

  // Map DB rows to VoteEntry (left → 'A', right → 'B')
  const entries: VoteEntry[] = rows.map(r => ({
    userId:    r.user_id as string,
    botChoice: (r.side === "left" ? "A" : "B") as "A" | "B",
    amount:    r.amount  as number,
  }));
  const result = resolveRound(entries, winnerSide === "left" ? "A" : "B");

  // resolveRound is the single source of payout truth (0 for a losing vote, the
  // parimutuel share for a winner, the stake back on a full refund). Apply every
  // payout in ONE transaction via apply_payouts (see 0018_atomic_payout.sql), so
  // all balances move together — everyone is paid at the same instant, not one
  // user at a time — and each credit is an atomic increment that can't clobber a
  // concurrent vote on another match.
  const voteIdByUser = new Map(rows.map(r => [r.user_id as string, r.id as string]));
  const payouts = result.rewards
    .map(r => ({ vote_id: voteIdByUser.get(r.userId), user_id: r.userId, payout: r.reward }))
    .filter((p): p is { vote_id: string; user_id: string; payout: number } => !!p.vote_id);

  const { error: payoutErr } = await supabase.rpc("apply_payouts", { p_payouts: payouts });
  if (payoutErr) {
    console.error("[rewardWinners] apply_payouts failed for match", matchId, payoutErr.message);
    throw new Error(`Failed to apply payouts: ${payoutErr.message}`);
  }

  console.log(
    `[rewardWinners] match ${matchId}: ${entries.length} votes, pool=${result.totalPool}, ` +
    `outcome=${result.winner === "REFUND" ? "REFUND (nobody backed winner)" : `winner=${winnerSide}`}, ` +
    `paid ${payouts.filter(p => p.payout > 0).length} in one transaction`
  );
}
