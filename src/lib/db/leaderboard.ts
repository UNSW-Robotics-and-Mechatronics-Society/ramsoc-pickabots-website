import "server-only";
import supabase from "@/lib/supabase";

export type LeaderboardEntry = {
  id: string;
  name: string;
  tokens: number;
  wins: number;
  losses: number;
};

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const [{ data: users, error: uErr }, { data: bets, error: bErr }, { data: matches, error: mErr }] =
    await Promise.all([
      supabase.from("users").select("id, display_name, tokens").order("tokens", { ascending: false }),
      supabase.from("bets").select("user_id, side, match_id"),
      supabase.from("matches").select("id, winner_side"),
    ]);
  if (uErr) throw new Error(`Failed to load users: ${uErr.message}`);
  if (bErr) throw new Error(`Failed to load bets: ${bErr.message}`);
  if (mErr) throw new Error(`Failed to load matches: ${mErr.message}`);

  const winnerSideByMatch = new Map((matches ?? []).map(m => [m.id as string, m.winner_side as string | null]));

  const recordByUser = new Map<string, { wins: number; losses: number }>();
  for (const b of bets ?? []) {
    const winnerSide = winnerSideByMatch.get(b.match_id as string);
    if (!winnerSide) continue; // match not resolved yet
    const rec = recordByUser.get(b.user_id as string) ?? { wins: 0, losses: 0 };
    if (b.side === winnerSide) rec.wins++; else rec.losses++;
    recordByUser.set(b.user_id as string, rec);
  }

  return (users ?? []).map((u): LeaderboardEntry => {
    const rec = recordByUser.get(u.id as string) ?? { wins: 0, losses: 0 };
    return {
      id: u.id as string,
      name: (u.display_name as string | null) ?? "Anonymous Pilot",
      tokens: u.tokens as number,
      wins: rec.wins,
      losses: rec.losses,
    };
  });
}
