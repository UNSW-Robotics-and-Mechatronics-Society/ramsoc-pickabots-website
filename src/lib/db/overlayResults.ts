import "server-only";
import supabase from "@/lib/supabase";
import { getBracketState } from "./bracket";
import { fromDbCategory } from "./division";
import type { Division } from "@/lib/mock-data";

export type RecentResult = {
  id: string;
  left: string;
  right: string;
  winnerSide: "left" | "right";
  scoreLeft: number | null;   // null when the bracket row is gone (reset)
  scoreRight: number | null;
  division: Division;
  isExhibition: boolean;
  resolvedAt: string;
};

/**
 * The last N resolved matches, newest first, for the "Recent Results"
 * overlay. Sourced from the voting `matches` table rather than
 * bracket_matches because it's the only place with a usable timeline:
 * resolved rows keep their winner_side + created_at forever
 * (reconcileVotingMatches only sweeps UNresolved strays), while
 * bracket_matches has no per-match completion timestamp. Scores are joined
 * back from the live bracket by bracket_match_id — best-effort, since a
 * bracket resize/reset can drop the row while the result row remains.
 */
export async function getRecentResults(limit: number): Promise<RecentResult[]> {
  const [{ data: rows, error }, bracket] = await Promise.all([
    supabase
      .from("matches")
      .select("id, bracket_match_id, left_name, right_name, winner_side, comp_type, is_exhibition, created_at")
      .not("winner_side", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit),
    getBracketState(),
  ]);
  if (error || !rows) return [];

  const bracketById = new Map(bracket.matches.map(m => [m.id, m]));
  return rows.map(r => {
    const bm = r.bracket_match_id ? bracketById.get(r.bracket_match_id as string) : undefined;
    return {
      id: r.id as string,
      left: (r.left_name as string) || "TBD",
      right: (r.right_name as string) || "TBD",
      winnerSide: r.winner_side as "left" | "right",
      scoreLeft: bm?.slotA.score ?? null,
      scoreRight: bm?.slotB.score ?? null,
      division: fromDbCategory(r.comp_type as string),
      isExhibition: !!r.is_exhibition,
      resolvedAt: r.created_at as string,
    };
  });
}
