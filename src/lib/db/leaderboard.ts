import "server-only";
import { unstable_cache } from "next/cache";
import supabase from "@/lib/supabase";

export type LeaderboardEntry = {
  id: string;
  name: string;
  tokens: number;
  wins: number;
  losses: number;
};

async function computeLeaderboard(): Promise<LeaderboardEntry[]> {
  const [{ data: users, error: uErr }, { data: votes, error: vErr }, { data: matches, error: mErr }] =
    await Promise.all([
      supabase.from("users").select("id, display_name, tokens").order("tokens", { ascending: false }),
      supabase.from("votes").select("user_id, side, match_id"),
      supabase.from("matches").select("id, winner_side"),
    ]);
  if (uErr) throw new Error(`Failed to load users: ${uErr.message}`);
  if (vErr) throw new Error(`Failed to load votes: ${vErr.message}`);
  if (mErr) throw new Error(`Failed to load matches: ${mErr.message}`);

  const winnerSideByMatch = new Map((matches ?? []).map(m => [m.id as string, m.winner_side as string | null]));

  const recordByUser = new Map<string, { wins: number; losses: number }>();
  for (const v of votes ?? []) {
    const winnerSide = winnerSideByMatch.get(v.match_id as string);
    if (!winnerSide) continue;
    const rec = recordByUser.get(v.user_id as string) ?? { wins: 0, losses: 0 };
    if (v.side === winnerSide) rec.wins++; else rec.losses++;
    recordByUser.set(v.user_id as string, rec);
  }

  return (users ?? []).map((u): LeaderboardEntry => {
    const rec = recordByUser.get(u.id as string) ?? { wins: 0, losses: 0 };
    return {
      id: u.id as string,
      name: (u.display_name as string | null) ?? "Anonymous Player",
      tokens: u.tokens as number,
      wins: rec.wins,
      losses: rec.losses,
    };
  });
}

// Cached so the burst of viewers who refresh right after a game resolves (all
// within a few seconds) collapses to a single DB computation instead of one
// full scan of users+votes+matches per viewer. Invalidated the moment a bracket
// save records a result + pays out — see revalidateTag('leaderboard') in
// app/api/admin/bracket/route.ts — so standings are correct after each game.
// The revalidate here is only a safety backstop; freshness comes from that
// invalidation, not a timer (the leaderboard deliberately does NOT move between
// games — see LeaderboardPage's `matches`-only subscription).
export const getLeaderboard = unstable_cache(computeLeaderboard, ["leaderboard"], {
  revalidate: 300,
  tags: ["leaderboard"],
});

// Nudge every open leaderboard to refresh after a NON-game token change — the
// beg reward, an admin boost/deduct, or a kick. Bumping this one-row table
// fires a realtime event the leaderboard subscribes to (see 0019_leaderboard_
// signal.sql + LeaderboardPage), WITHOUT subscribing it to `users`, which
// changes on every vote and would bring back constant churn. Best-effort: a
// failed nudge must not fail the action that triggered it. Pair with
// revalidateTag('leaderboard', { expire: 0 }) so the triggered refresh reads
// fresh standings rather than the cached ones.
export async function bumpLeaderboardSignal(): Promise<void> {
  const { error } = await supabase
    .from("leaderboard_signal")
    .update({ bumped_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) console.error("[leaderboard] signal bump failed:", error.message);
}
