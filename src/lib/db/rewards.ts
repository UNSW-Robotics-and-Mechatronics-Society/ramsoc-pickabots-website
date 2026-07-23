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

  console.log(
    `[rewardWinners] match ${matchId}: ${entries.length} votes, ` +
    `pool=${result.totalPool}, outcome=${result.winner === "REFUND" ? "REFUND (nobody backed winner)" : `winner=${winnerSide}`}`
  );

  // resolveRound assigns every entry its payout (0 for a losing vote, the
  // parimutuel share for a winner, the stake back on a full refund). Record
  // that payout on each vote row so the coin ledger reads gain/loss straight
  // off `votes`, and credit tokens for anyone who gained.
  const voteIdByUser = new Map(rows.map(r => [r.user_id as string, r.id as string]));

  for (const r of result.rewards) {
    const voteId = voteIdByUser.get(r.userId);
    if (voteId) {
      await supabase.from("votes").update({ payout: r.reward }).eq("id", voteId);
    }
    if (r.reward <= 0) continue;

    const { data: userRows, error: userErr } = await supabase
      .from("users").select("tokens").eq("id", r.userId).limit(1);
    if (userErr) {
      console.error("[rewardWinners] failed to read tokens for user", r.userId, userErr.message);
      continue;
    }

    const current = userRows?.[0]?.tokens ?? 0;
    const { error: updateErr } = await supabase
      .from("users").update({ tokens: current + r.reward }).eq("id", r.userId);

    if (updateErr) {
      console.error("[rewardWinners] failed to update tokens for user", r.userId, updateErr.message);
    } else {
      console.log(
        `[rewardWinners] ${r.refunded ? "refunded" : "paid"} user ${r.userId}: ` +
        `+${r.reward} tokens (${current} → ${current + r.reward})`
      );
    }
  }
}
