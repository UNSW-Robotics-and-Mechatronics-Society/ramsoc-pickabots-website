import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { updateSpecialTeam, deleteSpecialTeam, type SpecialTeamCategory } from "@/lib/db/specialTeams";

const CATEGORIES: SpecialTeamCategory[] = ["std", "open", "boss", "other"];

// PATCH /api/admin/special-teams/[id] — edit a one-time/exhibition team
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if ("name" in body) patch.name = body.name;
  if ("email" in body) patch.email = body.email;
  if ("phone" in body) patch.phone = body.phone;
  if ("notes" in body) patch.notes = body.notes;
  if ("present" in body) patch.present = body.present;
  if ("category" in body && CATEGORIES.includes(body.category)) patch.category = body.category;

  try {
    const team = await updateSpecialTeam(id, patch);
    return NextResponse.json(team);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// DELETE /api/admin/special-teams/[id] — remove a one-time/exhibition team
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await deleteSpecialTeam(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
