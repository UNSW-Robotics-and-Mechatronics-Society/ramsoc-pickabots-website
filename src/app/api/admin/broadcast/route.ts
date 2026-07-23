import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { getAllCaptainContacts } from "@/lib/db/profiles";
import { sendManySms } from "@/lib/sms";
import { logSmsResults } from "@/lib/db/notify";
import { renderBroadcastTemplate, firstNameOf } from "@/lib/sms-template";

// GET → recipient summary (count + how many have a usable phone), so the admin
// UI can show "Send to N captains" before firing.
export async function GET() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const captains = await getAllCaptainContacts();
    const withPhone = captains.filter(c => c.phone).length;
    return NextResponse.json({ total: captains.length, withPhone });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// POST { body } → send the same message to EVERY team captain (a mass send;
// the UI must confirm first).
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const body = payload?.body;
  if (typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "body (message text) is required" }, { status: 400 });
  }

  try {
    const captains = await getAllCaptainContacts();
    const recipients = captains.filter(c => c.phone);
    if (recipients.length === 0) {
      return NextResponse.json({ sent: 0, results: [], note: "No captain phone numbers found" });
    }

    // Rendered per captain so placeholders ({first}/{captain}/{team}/{division})
    // personalise each message.
    const messages = recipients.map(c => ({
      to: c.phone,
      body: renderBroadcastTemplate(body, {
        first: firstNameOf(c.fullName),
        captain: c.fullName,
        team: c.teamName,
        division: c.division,
      }),
    }));
    const results = await sendManySms(messages);
    await logSmsResults(
      results.map((r, i) => ({
        to: r.to,
        body: messages[i].body,
        status: r.status,
        error: r.error,
        teamId: recipients[i]?.teamId ?? null,
        kind: "manual",
      })),
    );
    return NextResponse.json({ sent: results.filter(r => r.ok).length, total: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
