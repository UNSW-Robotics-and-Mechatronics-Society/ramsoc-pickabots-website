import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { setObsOverride } from "@/lib/db/obs";
import { MAX_RINGS } from "@/lib/schedule";

export async function POST(req: NextRequest) {
  if (!isAdminUser(await currentUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as
    { active?: boolean; ring?: number; left?: string; right?: string } | null;
  if (!body || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active (boolean) is required" }, { status: 400 });
  }
  const ring = Math.min(MAX_RINGS, Math.max(0, Math.trunc(body.ring ?? 0)));
  try {
    await setObsOverride({
      active: body.active,
      ring,
      left: (body.left ?? "").trim(),
      right: (body.right ?? "").trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
