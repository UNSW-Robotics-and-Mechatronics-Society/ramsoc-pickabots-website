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
/**
 * Event-wide betting totals for the KPI banner: every coin ever wagered
 * (sum of vote amounts across all matches, resolved and live) and how many
 * distinct players have placed at least one bet. One indexed-column scan of
 * `votes` per overlay refresh — same budget reasoning as the odds read above.
 */
export type WagerStats = {
  totalWagered: number;
  bettors: number;
  biggestPool: number;
  /** Cumulative coins wagered per match, in match-creation order — the
   *  sparkline series. Vote rows carry no timestamp, so match sequence is
   *  the honest x-axis. */
  cumulativeByMatch: number[];
};

/**
 * Everything the info board's money widgets need in one pass: one votes scan
 * + one matches scan (ids + created_at only). Pools are grouped per match,
 * then laid out on the match-creation timeline for the cumulative series.
 */
export async function getWagerStats(): Promise<WagerStats> {
  const [{ data: votes, error: vErr }, { data: ms, error: mErr }] = await Promise.all([
    supabase.from("votes").select("user_id, amount, match_id"),
    supabase.from("matches").select("id, created_at").order("created_at", { ascending: true }),
  ]);
  if (vErr || mErr) return { totalWagered: 0, bettors: 0, biggestPool: 0, cumulativeByMatch: [] };

  let totalWagered = 0;
  const users = new Set<string>();
  const poolByMatch = new Map<string, number>();
  for (const v of votes ?? []) {
    const amount = (v.amount as number) ?? 0;
    totalWagered += amount;
    users.add(v.user_id as string);
    const mid = v.match_id as string;
    poolByMatch.set(mid, (poolByMatch.get(mid) ?? 0) + amount);
  }

  let biggestPool = 0;
  for (const p of poolByMatch.values()) biggestPool = Math.max(biggestPool, p);

  const cumulativeByMatch: number[] = [];
  let running = 0;
  for (const m of ms ?? []) {
    const pool = poolByMatch.get(m.id as string);
    if (pool === undefined) continue; // matches nobody bet on don't flatten the line
    running += pool;
    cumulativeByMatch.push(running);
  }

  return { totalWagered, bettors: users.size, biggestPool, cumulativeByMatch };
}

export async function getWagerTotals(): Promise<{ totalWagered: number; bettors: number }> {
  const { data, error } = await supabase.from("votes").select("user_id, amount");
  if (error) return { totalWagered: 0, bettors: 0 };
  let totalWagered = 0;
  const users = new Set<string>();
  for (const v of data ?? []) {
    totalWagered += (v.amount as number) ?? 0;
    users.add(v.user_id as string);
  }
  return { totalWagered, bettors: users.size };
}

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
