import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import supabase from "@/lib/supabase";
import { payoutMatch } from "@/lib/db/payouts";

// POST /api/admin/matches/[id]/resolve — mark a match resolved and pay out bets
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
    .update({ winner_side, is_active: false, bidding_open: false })
    .eq("id", matchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await payoutMatch(matchId, winner_side).catch(err =>
    console.error("[resolve] payout failed for match", matchId, err)
  );

  return NextResponse.json({ ok: true });
}
