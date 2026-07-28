import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { getBracketStateFresh, saveBracketState, type BracketSave } from "@/lib/db/bracket";

async function requireAdmin(): Promise<boolean> {
  const user = await currentUser();
  return isAdminUser(user);
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const state = await getBracketStateFresh();
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/**
 * Applies one bracket write. The body is a partial save (see BracketSave): an
 * ordinary edit carries only the match rows that changed, so concurrent admins
 * don't overwrite each other, while auto-fill / resize / reset-all set
 * `replaceAll` to replace a whole bracket.
 */
export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body: BracketSave = await req.json();
  try {
    await saveBracketState(body);
    // A save is the "a game happened" event: it records results and pays out
    // (see saveBracketState → syncCompletedMatches → rewardWinners). Refresh
    // the caches those reads depend on. Bracket uses stale-while-revalidate
    // ('max') since the public bracket pages re-refresh on their own realtime
    // events. The leaderboard is invalidated immediately ({ expire: 0 }) because
    // its refresh is a single shot fired by this same save — it must read the
    // post-payout standings, not a stale snapshot.
    revalidateTag("bracket", "max");
    revalidateTag("leaderboard", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
