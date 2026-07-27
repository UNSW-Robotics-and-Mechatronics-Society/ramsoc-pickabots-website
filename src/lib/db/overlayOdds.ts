import "server-only";
import supabase from "@/lib/supabase";
import { getLiveStandings, type VoteEntry } from "@/lib/vote-pool";

export type OverlayOdds = {
  votingOpen: boolean;
  totalPool: number;
  votes: number;
  pctLeft: number;
  pctRight: number;
  /** Parimutuel payout per coin if that side wins; null while its pool is empty. */
  multLeft: number | null;
  multRight: number | null;
};

/**
 * Live odds for ONE bracket match, for the on-stream lower-third. Same
 * numbers as /api/standings (same pool math via getLiveStandings), but keyed
 * from the bracket side: the overlay knows its ring's bracket match, and the
 * public voting row is reachable through matches.bracket_match_id.
 *
 * Uncached, unlike /api/standings' 2s TTL: that endpoint absorbs a crowd
 * polling every active match at once; this is one row + one vote scan per
 * overlay refresh, and those refreshes are already throttled client-side
 * (OverlayRefresh) with at most six overlay sources in existence.
 *
 * Returns null when the match has no live voting row (not reconciled yet, or
 * already resolved) — the overlay simply omits the odds strip then.
 */
export async function getOddsForBracketMatch(bracketMatchId: string): Promise<OverlayOdds | null> {
  const { data: rows, error } = await supabase
    .from("matches")
    .select("id, voting_open")
    .eq("bracket_match_id", bracketMatchId)
    .is("winner_side", null)
    .limit(1);
  if (error || !rows || rows.length === 0) return null;
  const row = rows[0];

  const { data: votes, error: vErr } = await supabase
    .from("votes")
    .select("side, amount")
    .eq("match_id", row.id as string);
  if (vErr) return null;

  // getLiveStandings only reads side + amount, so userId is left empty —
  // same trick as /api/standings.
  const entries: VoteEntry[] = (votes ?? []).map(v => ({
    userId: "",
    botChoice: v.side === "left" ? "A" : "B",
    amount: v.amount as number,
  }));
  const s = getLiveStandings(entries);
  const noData = s.totalPool === 0;

  return {
    votingOpen: !!row.voting_open,
    totalPool: s.totalPool,
    votes: entries.length,
    pctLeft: noData ? 50 : Math.round((s.poolA / s.totalPool) * 100),
    pctRight: noData ? 50 : 100 - Math.round((s.poolA / s.totalPool) * 100),
    multLeft: s.multiplierIfAWins,
    multRight: s.multiplierIfBWins,
  };
}
