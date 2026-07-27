import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { resetTokensOnly } from "@/lib/db/resetAll";

// POST /api/admin/reset-tokens — set every player's RamCoin balance back to
// 100 WITHOUT touching voting history (votes/matches survive, so past results
// and the leaderboard record are kept). Distinct from /api/admin/reset-all,
// which additionally wipes all voting history.
export async function POST() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await resetTokensOnly();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
