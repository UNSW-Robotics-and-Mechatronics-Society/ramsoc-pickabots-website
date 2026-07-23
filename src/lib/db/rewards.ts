import "server-only";
import supabase from "@/lib/supabase";
import { resolveRound } from "@/lib/vote-pool";
import type { VoteEntry } from "@/lib/vote-pool";

/**
 * Rewards all voters for a resolved match using resolveRound as the single
 * source of payout truth. Winners receive their proportional share of the
 * total pool. If nobody backed the winner, everyone is refunded their stake.
 */
export async function rewardWinners(matchId: string, winnerSide: "left" | "right"): Promise<void> {
  const { data: rows, error: votesErr } = await supabase
    .from("votes")
    .select("user_id, side, amount")
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

  // Apply reward for every entry that receives something (winners + refunded).
  // Losers in a normal round have reward=0 and are skipped.
  for (const r of result.rewards) {
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
