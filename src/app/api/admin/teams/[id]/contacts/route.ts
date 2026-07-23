import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { getTeamContacts } from "@/lib/db/profiles";
import { getSmsUpNextTemplate, getSmsLocation } from "@/lib/db/config";
import { smsSender, smsConfigured } from "@/lib/sms";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const [contacts, upNextTemplate, location] = await Promise.all([
      getTeamContacts(id),
      getSmsUpNextTemplate(),
      getSmsLocation(),
    ]);
    return NextResponse.json({
      contacts,
      sender: smsSender(),
      smsConfigured: smsConfigured(),
      upNextTemplate,
      location,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
