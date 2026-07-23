import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { sendManySms, type SmsMessage } from "@/lib/sms";
import { getTeamContacts, getTeamById } from "@/lib/db/profiles";
import { getBracketMatchTeams, setCaptainNotified, logSmsResults } from "@/lib/db/notify";
import { getSmsUpNextTemplate } from "@/lib/db/config";
import { renderSmsTemplate } from "@/lib/sms-template";

type NotifyNextRequestBody = {
  matchId?: unknown;
  force?: unknown;
};

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const raw = (await req.json()) as NotifyNextRequestBody;
    const matchId = raw.matchId;
    const force = raw.force === true;

    if (typeof matchId !== "string" || matchId.length === 0) {
      return NextResponse.json({ error: "'matchId' is required" }, { status: 400 });
    }

    const m = await getBracketMatchTeams(matchId);
    if (!m) return NextResponse.json({ error: "Match not found" }, { status: 404 });

    if (!force && m.captainNotified) {
      return NextResponse.json({ skipped: true, reason: "already notified" });
    }

    const slots: { teamId: string | null; fallbackName: string }[] = [
      { teamId: m.teamAId, fallbackName: m.slotAName },
      { teamId: m.teamBId, fallbackName: m.slotBName },
    ];

    const messages: SmsMessage[] = [];
    const messageTeamIds: (string | null)[] = [];

    // The admin-configured template, rendered per team.
    const template = await getSmsUpNextTemplate();

    for (const slot of slots) {
      if (!slot.teamId) continue;
      const [contacts, team] = await Promise.all([
        getTeamContacts(slot.teamId),
        getTeamById(slot.teamId),
      ]);
      const teamName = team?.name ?? slot.fallbackName;
      const captains = contacts.filter((c) => c.role === "captain" && c.phone);
      for (const captain of captains) {
        messages.push({ to: captain.phone, body: renderSmsTemplate(template, { team: teamName, division: m.division }) });
        messageTeamIds.push(slot.teamId);
      }
    }

    if (messages.length === 0) {
      await setCaptainNotified(matchId, true);
      return NextResponse.json({ sent: 0, results: [], note: "No captain phone numbers found" });
    }

    const results = await sendManySms(messages);

    await logSmsResults(
      results.map((r, i) => ({
        to: r.to,
        body: messages[i].body,
        status: r.status,
        error: r.error,
        teamId: messageTeamIds[i],
        matchId,
        kind: "auto_next",
      })),
    );

    await setCaptainNotified(matchId, true);

    return NextResponse.json({ sent: results.filter((r) => r.ok).length, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
