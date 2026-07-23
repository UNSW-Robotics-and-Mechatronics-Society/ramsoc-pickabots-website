import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { boostPlayer, kickPlayer } from "@/lib/db/players";

// PATCH { boost: number } → adjust a player's token balance (boost or deduct).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const amount = body?.boost;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "boost must be a non-zero number" }, { status: 400 });
  }

  try {
    const tokens = await boostPlayer(id, Math.trunc(amount));
    return NextResponse.json({ ok: true, tokens });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// DELETE → kick a player (removes their pickabots users row; sumobots profile untouched).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await kickPlayer(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
