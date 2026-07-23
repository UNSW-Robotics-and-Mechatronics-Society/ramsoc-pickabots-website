import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { notifyCaptainsForMatch } from "@/lib/db/notify";

// Manual "notify this match's captains now" — the automatic lead-time alerts
// fire server-side in saveBracketState (see lib/db/bracket.ts). Pass force:true
// to re-send even if they were already notified.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const raw = (await req.json().catch(() => ({}))) as { matchId?: unknown; force?: unknown };
    const matchId = raw.matchId;
    if (typeof matchId !== "string" || matchId.length === 0) {
      return NextResponse.json({ error: "'matchId' is required" }, { status: 400 });
    }
    const result = await notifyCaptainsForMatch(matchId, { force: raw.force === true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
