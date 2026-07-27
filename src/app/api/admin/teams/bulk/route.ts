import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { bulkUpdateTeamState, bulkSetSeeds } from "@/lib/db/teams";

// POST /api/admin/teams/bulk — apply one action to many teams at once.
//   { ids: string[], present: boolean }            → set present for all ids
//   { ids: string[], inBracket: boolean }          → set in-bracket for all ids
//   { seeds: { id: string, seed: number }[] }       → import one seed per team
// Used by the admin Settings panel's bulk team actions + seed import.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  try {
    if (Array.isArray(body?.seeds)) {
      const seeds = (body.seeds as unknown[])
        .map(s => s as { id?: unknown; seed?: unknown })
        .filter(s => typeof s.id === "string" && typeof s.seed === "number" && Number.isFinite(s.seed))
        .map(s => ({ teamId: s.id as string, seed: s.seed as number }));
      await bulkSetSeeds(seeds);
      return NextResponse.json({ ok: true, updated: seeds.length });
    }

    const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "provide ids (string[]) with present/inBracket, or seeds" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body?.present === "boolean") patch.present = body.present;
    if (typeof body?.inBracket === "boolean") patch.in_bracket = body.inBracket;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "provide present (boolean) or inBracket (boolean)" }, { status: 400 });
    }

    await bulkUpdateTeamState(ids, patch);
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
