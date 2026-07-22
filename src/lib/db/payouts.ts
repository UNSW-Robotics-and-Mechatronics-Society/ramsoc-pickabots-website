import "server-only";
import supabase from "@/lib/supabase";

/**
 * Pays out all bets for a resolved match.
 * Winners receive their proportional share of the total pool.
 * Losers lose their bet regardless — no refund even if nobody backed the winner.
 */
export async function payoutMatch(matchId: string, winnerSide: "left" | "right"): Promise<void> {
  const { data: bets } = await supabase
    .from("bets")
    .select("user_id, side, amount")
    .eq("match_id", matchId);

  if (!bets || bets.length === 0) return;

  const totalPool = bets.reduce((sum, b) => sum + (b.amount as number), 0);
  const winningBets = bets.filter(b => b.side === winnerSide);
  const winningPool = winningBets.reduce((sum, b) => sum + (b.amount as number), 0);

  // Nobody backed the winner — losers still lose, nobody gets paid out
  if (winningPool === 0) return;

  const payoutPerToken = totalPool / winningPool;

  for (const bet of winningBets) {
    const payout = Math.round(bet.amount * payoutPerToken * 100) / 100;
    const { data: userRows } = await supabase
      .from("users").select("tokens").eq("id", bet.user_id).limit(1);
    const current = userRows?.[0]?.tokens ?? 0;
    await supabase
      .from("users").update({ tokens: current + payout }).eq("id", bet.user_id);
  }
}
