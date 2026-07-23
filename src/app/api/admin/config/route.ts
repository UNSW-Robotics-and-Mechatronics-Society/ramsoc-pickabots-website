import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { getSmsUpNextTemplate, setSmsUpNextTemplate } from "@/lib/db/config";
import { DEFAULT_SMS_UP_NEXT } from "@/lib/sms-template";

// GET → current admin-editable config.
export async function GET() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const smsUpNextTemplate = await getSmsUpNextTemplate();
    return NextResponse.json({ smsUpNextTemplate, smsUpNextDefault: DEFAULT_SMS_UP_NEXT });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PUT { smsUpNextTemplate } → save. Empty string resets to the built-in default.
export async function PUT(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = body?.smsUpNextTemplate;
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "smsUpNextTemplate (string) required" }, { status: 400 });
  }
  const value = raw.trim() === "" ? DEFAULT_SMS_UP_NEXT : raw;

  try {
    await setSmsUpNextTemplate(value);
    return NextResponse.json({ ok: true, smsUpNextTemplate: value });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
