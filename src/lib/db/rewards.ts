import "server-only";
import supabase from "@/lib/supabase";

/**
 * Rewards all voters for a resolved match.
 * Winners receive their proportional share of the total pool.
 * Losers lose their votes regardless — no refund even if nobody backed the winner.
 */
export async function rewardWinners(matchId: string, winnerSide: "left" | "right"): Promise<void> {
  const { data: votes, error: votesErr } = await supabase
    .from("votes")
    .select("user_id, side, amount")
    .eq("match_id", matchId);

  if (votesErr) {
    console.error("[rewardWinners] failed to query votes for match", matchId, votesErr.message);
    throw votesErr;
  }
  if (!votes || votes.length === 0) {
    console.warn("[rewardWinners] no votes found for match", matchId, "— skipping payout. If this is unexpected, check the DB migration (bets → votes table rename).");
    return;
  }

  const totalPool = votes.reduce((sum, v) => sum + (v.amount as number), 0);
  const winningVotes = votes.filter(v => v.side === winnerSide);
  const winningPool = winningVotes.reduce((sum, v) => sum + (v.amount as number), 0);

  console.log(`[rewardWinners] match ${matchId}: ${votes.length} votes, pool=${totalPool}, winner=${winnerSide}, winners=${winningVotes.length}`);

  if (winningPool === 0) {
    console.log("[rewardWinners] nobody backed the winner — no payout");
    return;
  }

  const rewardPerToken = totalPool / winningPool;

  for (const vote of winningVotes) {
    const reward = Math.round(vote.amount * rewardPerToken * 100) / 100;
    const { data: userRows, error: userErr } = await supabase
      .from("users").select("tokens").eq("id", vote.user_id).limit(1);
    if (userErr) {
      console.error("[rewardWinners] failed to read tokens for user", vote.user_id, userErr.message);
      continue;
    }
    const current = userRows?.[0]?.tokens ?? 0;
    const { error: updateErr } = await supabase
      .from("users").update({ tokens: current + reward }).eq("id", vote.user_id);
    if (updateErr) {
      console.error("[rewardWinners] failed to update tokens for user", vote.user_id, updateErr.message);
    } else {
      console.log(`[rewardWinners] paid user ${vote.user_id}: +${reward} tokens (${current} → ${current + reward})`);
    }
  }
}
