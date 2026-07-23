import "server-only";
import supabase from "@/lib/supabase";

/**
 * Rewards all voters for a resolved match.
 * Winners receive their proportional share of the total pool.
 * Losers lose their votes regardless — no refund even if nobody backed the winner.
 */
export async function rewardWinners(matchId: string, winnerSide: "left" | "right"): Promise<void> {
  const { data: votes } = await supabase
    .from("votes")
    .select("user_id, side, amount")
    .eq("match_id", matchId);

  if (!votes || votes.length === 0) return;

  const totalPool = votes.reduce((sum, v) => sum + (v.amount as number), 0);
  const winningVotes = votes.filter(v => v.side === winnerSide);
  const winningPool = winningVotes.reduce((sum, v) => sum + (v.amount as number), 0);

  // Nobody backed the winner — losers still lose, nobody gets rewarded
  if (winningPool === 0) return;

  const rewardPerToken = totalPool / winningPool;

  for (const vote of winningVotes) {
    const reward = Math.round(vote.amount * rewardPerToken * 100) / 100;
    const { data: userRows } = await supabase
      .from("users").select("tokens").eq("id", vote.user_id).limit(1);
    const current = userRows?.[0]?.tokens ?? 0;
    await supabase
      .from("users").update({ tokens: current + reward }).eq("id", vote.user_id);
  }
}
