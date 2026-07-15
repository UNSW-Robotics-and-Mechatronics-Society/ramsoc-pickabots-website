import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { updateTeamState } from "@/lib/db/teams";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if ("seed" in body) patch.seed = body.seed;
  if ("comment" in body) patch.comment = body.comment;
  if ("present" in body) patch.present = body.present;
  if ("wildcard" in body) patch.wildcard = body.wildcard;
  if ("points" in body) patch.points = body.points;

  try {
    await updateTeamState(id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
