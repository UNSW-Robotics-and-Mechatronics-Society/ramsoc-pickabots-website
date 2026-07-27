import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import supabase from "@/lib/supabase";
import { rewardWinners } from "@/lib/db/rewards";

// POST /api/admin/matches/[id]/resolve — mark a match resolved and reward winning voters
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((sessionClaims?.publicMetadata as { role?: string } | undefined)?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: matchId } = await params;
  const { winner_side } = await req.json() as { winner_side: "left" | "right" };

  if (!["left", "right"].includes(winner_side))
    return NextResponse.json({ error: 'winner_side must be "left" or "right"' }, { status: 400 });

  const { error } = await supabase
    .from("matches")
    .update({ winner_side, is_active: false, voting_open: false })
    .eq("id", matchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let payoutError: string | null = null;
  try {
    await rewardWinners(matchId, winner_side);
  } catch (err) {
    payoutError = err instanceof Error ? err.message : String(err);
    console.error("[resolve] reward failed for match", matchId, payoutError);
  }

  // Resolving a match changes W/L (winner_side above) and token payouts, both of
  // which the leaderboard ranks by — drop its cache so the post-game refresh
  // reads fresh standings (same as the bracket-save path).
  revalidateTag("leaderboard", { expire: 0 });

  return NextResponse.json({ ok: true, payoutError });
}
