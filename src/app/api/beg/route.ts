import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBegState, attemptBeg } from "@/lib/db/beg";

// GET → current beg eligibility/state for the signed-in player.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const state = await getBegState(userId);
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// POST { accuracy: number } → attempt a beg; server owns all rules + the award.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const accuracy = body?.accuracy;
  if (typeof accuracy !== "number") {
    return NextResponse.json({ error: "accuracy (number) required" }, { status: 400 });
  }

  try {
    const result = await attemptBeg(userId, accuracy);
    if (!result.ok) {
      // 409 = rules not satisfied (not broke / no begs left / cooldown).
      return NextResponse.json({ error: result.error, state: result.state }, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
