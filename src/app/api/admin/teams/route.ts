import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { listTeams } from "@/lib/db/teams";

// GET /api/admin/teams — the current team list (seeds, present, in-bracket,
// notes) straight from the database.
//
// The admin page reads teams once, server-side, into useState and never
// refreshes them, so one admin's seed edits stayed invisible to another until a
// reload. AdminPageClient polls this and merges the result, keeping any field
// it has an unsaved local edit on.
//
// Deliberately admin-gated rather than driven by Supabase Realtime: realtime with
// the anon key needs a public-read RLS policy on pickabots_team_state, and that
// table holds the private per-team admin `comment` notes.
export async function GET() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json(await listTeams());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
