import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import {
  getSmsUpNextTemplate,
  setSmsUpNextTemplate,
  getNotifyLead,
  setNotifyLead,
  getSmsLocation,
  setSmsLocation,
} from "@/lib/db/config";
import { DEFAULT_SMS_UP_NEXT, DEFAULT_SMS_LOCATION } from "@/lib/sms-template";

// GET → current admin-editable config.
export async function GET() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [smsUpNextTemplate, smsNotifyLead, smsLocation] = await Promise.all([
      getSmsUpNextTemplate(),
      getNotifyLead(),
      getSmsLocation(),
    ]);
    return NextResponse.json({
      smsUpNextTemplate,
      smsUpNextDefault: DEFAULT_SMS_UP_NEXT,
      smsNotifyLead,
      smsLocation,
      smsLocationDefault: DEFAULT_SMS_LOCATION,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PUT { smsUpNextTemplate?, smsNotifyLead?, smsLocation? } → save whichever
// fields are given. An empty template/location resets it to the built-in default.
export async function PUT(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const hasTemplate = typeof body?.smsUpNextTemplate === "string";
  const hasLead = typeof body?.smsNotifyLead === "number" && Number.isFinite(body.smsNotifyLead);
  const hasLocation = typeof body?.smsLocation === "string";
  if (!hasTemplate && !hasLead && !hasLocation) {
    return NextResponse.json(
      { error: "provide smsUpNextTemplate (string), smsNotifyLead (number) and/or smsLocation (string)" },
      { status: 400 },
    );
  }

  try {
    if (hasTemplate) {
      const raw: string = body.smsUpNextTemplate;
      await setSmsUpNextTemplate(raw.trim() === "" ? DEFAULT_SMS_UP_NEXT : raw);
    }
    if (hasLead) await setNotifyLead(body.smsNotifyLead);
    if (hasLocation) await setSmsLocation(body.smsLocation);

    const [smsUpNextTemplate, smsNotifyLead, smsLocation] = await Promise.all([
      getSmsUpNextTemplate(),
      getNotifyLead(),
      getSmsLocation(),
    ]);
    return NextResponse.json({ ok: true, smsUpNextTemplate, smsNotifyLead, smsLocation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
