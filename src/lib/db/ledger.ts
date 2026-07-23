import "server-only";
import supabase from "@/lib/supabase";

export type LedgerEntry = {
  id: string;
  matchId: string;
  compType: string;
  pickedName: string;
  opponentName: string;
  side: "left" | "right";
  amount: number;
  status: "pending" | "won" | "lost";
  // Null while pending, and also null for a resolved "won" vote whose payout
  // predates the payout column being recorded (legacy data) — shown as
  // untracked rather than guessed at.
  payout: number | null;
  net: number | null;
  createdAt: string;
};

export type UserLedger = {
  id: string;
  name: string;
  tokens: number;
  wins: number;
  losses: number;
  winRate: number;
  totalGained: number;
  totalLost: number;
  netTotal: number;
  entries: LedgerEntry[];
};

export async function getUserLedger(userId: string): Promise<UserLedger | null> {
  const [{ data: userRows, error: uErr }, { data: votes, error: vErr }] = await Promise.all([
    supabase.from("users").select("id, display_name, tokens").eq("id", userId).limit(1),
    supabase
      .from("votes")
      .select("id, match_id, side, amount, payout, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  if (uErr) throw new Error(`Failed to load user: ${uErr.message}`);
  if (vErr) throw new Error(`Failed to load votes: ${vErr.message}`);

  const user = userRows?.[0];
  if (!user) return null;

  const matchIds = Array.from(new Set((votes ?? []).map(v => v.match_id as string)));
  const { data: matches, error: mErr } = matchIds.length
    ? await supabase.from("matches").select("id, comp_type, left_name, right_name, winner_side").in("id", matchIds)
    : { data: [] as { id: string; comp_type: string; left_name: string; right_name: string; winner_side: string | null }[], error: null };
  if (mErr) throw new Error(`Failed to load matches: ${mErr.message}`);

  const matchById = new Map((matches ?? []).map(m => [m.id as string, m]));

  let wins = 0;
  let losses = 0;
  let totalGained = 0;
  let totalLost = 0;

  const entries: LedgerEntry[] = (votes ?? []).map(v => {
    const match = matchById.get(v.match_id as string);
    const side = v.side as "left" | "right";
    const amount = v.amount as number;
    const pickedName = (side === "left" ? match?.left_name : match?.right_name) ?? "Unknown";
    const opponentName = (side === "left" ? match?.right_name : match?.left_name) ?? "Unknown";
    const resolved = !!match?.winner_side;
    const status: LedgerEntry["status"] = !resolved ? "pending" : match!.winner_side === side ? "won" : "lost";

    // Losers always record 0 at resolution time; a "won" vote without a
    // recorded payout means it resolved before this column existed.
    const payout: number | null = !resolved ? null : status === "lost" ? 0 : (v.payout as number | null);
    const net = payout !== null ? Math.round((payout - amount) * 100) / 100 : null;

    if (status === "won") wins++;
    if (status === "lost") losses++;
    if (net !== null) {
      if (net >= 0) totalGained += net;
      else totalLost += -net;
    }

    return {
      id: v.id as string,
      matchId: v.match_id as string,
      compType: match?.comp_type ?? "standard",
      pickedName,
      opponentName,
      side,
      amount,
      status,
      payout,
      net,
      createdAt: v.created_at as string,
    };
  });

  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  return {
    id: user.id as string,
    name: (user.display_name as string | null) ?? "Anonymous Pilot",
    tokens: user.tokens as number,
    wins,
    losses,
    winRate,
    totalGained: Math.round(totalGained * 100) / 100,
    totalLost: Math.round(totalLost * 100) / 100,
    netTotal: Math.round((totalGained - totalLost) * 100) / 100,
    entries,
  };
}
