import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { resetTokensAndHistory } from "@/lib/db/resetAll";

// POST /api/admin/reset-all — wipes all voting history and resets every
// user's balance to 100. Called alongside (not instead of) the normal
// bracket-save flow, which handles clearing both divisions' teams/schedules
// and deleting exhibition matches — see AdminPageClient.handleResetAll.
export async function POST() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await resetTokensAndHistory();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
