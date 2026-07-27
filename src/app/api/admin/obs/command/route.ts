import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { enqueueObsCommand } from "@/lib/db/obs";
import type { ObsAction } from "@/lib/obs";

// Mirrors the DB CHECK in 0022 — validated here too so a bad action fails
// with a 400 the panel can show, not an opaque constraint violation.
const ACTIONS: ReadonlySet<string> = new Set([
  "set_scene",
  "start_stream", "stop_stream",
  "start_record", "stop_record",
  "start_replay_buffer", "save_replay_buffer",
]);

export async function POST(req: NextRequest) {
  if (!isAdminUser(await currentUser())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { action?: string; payload?: Record<string, unknown> } | null;
  if (!body?.action || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (body.action === "set_scene" && typeof body.payload?.scene !== "string") {
    return NextResponse.json({ error: "set_scene requires payload.scene" }, { status: 400 });
  }
  try {
    await enqueueObsCommand(body.action as ObsAction, body.payload ?? {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
