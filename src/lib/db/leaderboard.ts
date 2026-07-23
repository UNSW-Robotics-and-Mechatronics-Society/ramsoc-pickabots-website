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
      name: (u.display_name as string | null) ?? "Anonymous Pilot",
      tokens: u.tokens as number,
      wins: rec.wins,
      losses: rec.losses,
    };
  });
}
