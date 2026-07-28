import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { updateTeamState, findSeedConflicts } from "@/lib/db/teams";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // Seeds must be unique within a division — Auto Fill has no defined order for
  // two teams sharing one. Checked here rather than only in the client because
  // the admin page never refreshes its team list: two admins can each assign the
  // same seed to different teams and both pass their own local check. 409 so the
  // caller can revert its optimistic update and say why.
  if ("seed" in body && typeof body.seed === "number") {
    try {
      const conflicts = await findSeedConflicts([{ teamId: id, seed: body.seed }]);
      if (conflicts.length > 0) {
        return NextResponse.json({ error: "Duplicate seed", conflicts }, { status: 409 });
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Seed check failed" }, { status: 500 });
    }
  }

  const patch: Record<string, unknown> = {};
  if ("seed" in body) patch.seed = body.seed;
  if ("comment" in body) patch.comment = body.comment;
  if ("present" in body) patch.present = body.present;
  if ("inBracket" in body) patch.in_bracket = body.inBracket;
  if ("points" in body) patch.points = body.points;

  try {
    await updateTeamState(id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
