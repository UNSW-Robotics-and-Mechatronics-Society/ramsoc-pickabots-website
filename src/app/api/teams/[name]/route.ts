import { NextResponse } from "next/server";
import { getTeamLedger } from "@/lib/db/teamLedger";
import type { Division } from "@/lib/mock-data";

// GET /api/teams/[name] — a team's public ledger (tokens bet, rank, W/L,
// past/next matches). Deliberately unauthenticated: bracket, matches, and
// voting are all public pages already showing team names and match results.
// Optional ?division=standards|open disambiguates when a name happens to
// exist as a team in both divisions — best-effort, since team names aren't
// enforced unique across the shared teams table.
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const divisionParam = new URL(req.url).searchParams.get("division");
  const divisionHint: Division | undefined =
    divisionParam === "standards" || divisionParam === "open" ? divisionParam : undefined;

  try {
    const ledger = await getTeamLedger(name, divisionHint);
    if (!ledger) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    return NextResponse.json(ledger);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
