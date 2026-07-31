import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { grantTokensToAllPlayers } from "@/lib/db/players";
import { bumpLeaderboardSignal } from "@/lib/db/leaderboard";

// Guard against a fat-fingered extra zero handing out a meaningless balance —
// the input is a plain number field, so the only sanity check is here.
const MAX_GRANT = 100_000;

// POST { amount: number } — add `amount` RamCoin to every player's balance
// (negative deducts; balances floor at 0). Relative, so it tops everyone up
// without flattening the standings — distinct from /api/admin/reset-tokens,
// which overwrites every balance with a flat 100.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = body?.amount;
  if (typeof raw !== "number" || !Number.isFinite(raw) || Math.trunc(raw) === 0) {
    return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
  }
  const amount = Math.trunc(raw);
  if (Math.abs(amount) > MAX_GRANT) {
    return NextResponse.json({ error: `amount must be within ±${MAX_GRANT}` }, { status: 400 });
  }

  try {
    const players = await grantTokensToAllPlayers(amount);
    // Every balance moved, so standings and totals are stale on open
    // leaderboards — wake them and make that refresh read fresh data.
    await bumpLeaderboardSignal();
    revalidateTag("leaderboard", { expire: 0 });
    return NextResponse.json({ ok: true, amount, players });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
