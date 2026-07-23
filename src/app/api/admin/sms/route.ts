import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { sendManySms, smsSender } from "@/lib/sms";
import { logSmsResults } from "@/lib/db/notify";

type SmsRequestBody = {
  to?: unknown;
  body?: unknown;
  teamId?: unknown;
  matchId?: unknown;
  kind?: unknown;
};

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const raw = (await req.json()) as SmsRequestBody;

    const body = raw.body;
    const to = raw.to;

    if (typeof body !== "string" || body.length === 0) {
      return NextResponse.json({ error: "'body' must be a non-empty string" }, { status: 400 });
    }
    if (!Array.isArray(to) || to.length === 0 || !to.every((t) => typeof t === "string")) {
      return NextResponse.json({ error: "'to' must be a non-empty array of strings" }, { status: 400 });
    }

    const teamId = typeof raw.teamId === "string" ? raw.teamId : undefined;
    const matchId = typeof raw.matchId === "string" ? raw.matchId : undefined;
    const kind = raw.kind === "manual" || raw.kind === "auto_next" ? raw.kind : undefined;

    const dedupedTo = Array.from(new Set(to));

    const results = await sendManySms(dedupedTo.map((t) => ({ to: t, body })));

    await logSmsResults(
      results.map((r) => ({
        to: r.to,
        body,
        status: r.status,
        error: r.error,
        teamId: teamId ?? null,
        matchId: matchId ?? null,
        kind: kind ?? "manual",
      })),
    );

    return NextResponse.json({ results, sender: smsSender() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
