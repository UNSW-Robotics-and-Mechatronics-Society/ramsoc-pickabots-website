import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { bulkBoostAllPlayers } from "@/lib/db/players";
import { bumpLeaderboardSignal } from "@/lib/db/leaderboard";

// POST { boost: number } → adjust every player's token balance at once (boost or deduct).
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const amount = body?.boost;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "boost must be a non-zero number" }, { status: 400 });
  }

  try {
    await bulkBoostAllPlayers(Math.trunc(amount));
    // Adjusting every balance reorders standings — reflect it on open
    // leaderboards right away, and make that refresh read fresh data.
    await bumpLeaderboardSignal();
    revalidateTag("leaderboard", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
