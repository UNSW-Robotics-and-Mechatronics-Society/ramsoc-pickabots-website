import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import {
  getSmsUpNextTemplate,
  setSmsUpNextTemplate,
  getNotifyLead,
  setNotifyLead,
  getAllIn,
  setAllIn,
  getAutoSmsEnabled,
  setAutoSmsEnabled,
  getSmsSenderMode,
  setSmsSenderMode,
  getSmsSenderNumber,
  setSmsSenderNumber,
} from "@/lib/db/config";
import { DEFAULT_SMS_UP_NEXT } from "@/lib/sms-template";

// GET → current admin-editable config.
export async function GET() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [smsUpNextTemplate, smsNotifyLead, allIn, autoSmsEnabled, smsSenderMode, smsSenderNumber] =
      await Promise.all([
        getSmsUpNextTemplate(),
        getNotifyLead(),
        getAllIn(),
        getAutoSmsEnabled(),
        getSmsSenderMode(),
        getSmsSenderNumber(),
      ]);
    return NextResponse.json({
      smsUpNextTemplate,
      smsUpNextDefault: DEFAULT_SMS_UP_NEXT,
      smsNotifyLead,
      allIn,
      autoSmsEnabled,
      smsSenderMode,
      smsSenderNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PUT { smsUpNextTemplate?, smsNotifyLead?, allIn?, autoSmsEnabled? } → save
// whichever fields are given. An empty template string resets it to the
// built-in default.
export async function PUT(req: NextRequest) {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const hasTemplate = typeof body?.smsUpNextTemplate === "string";
  const hasLead = typeof body?.smsNotifyLead === "number" && Number.isFinite(body.smsNotifyLead);
  const hasAllIn = typeof body?.allIn === "boolean";
  const hasAutoSms = typeof body?.autoSmsEnabled === "boolean";
  const hasSenderMode = body?.smsSenderMode === "senderid" || body?.smsSenderMode === "number";
  const hasSenderNumber = typeof body?.smsSenderNumber === "string";
  if (!hasTemplate && !hasLead && !hasAllIn && !hasAutoSms && !hasSenderMode && !hasSenderNumber) {
    return NextResponse.json(
      {
        error:
          "provide smsUpNextTemplate (string), smsNotifyLead (number), allIn (boolean), autoSmsEnabled (boolean), smsSenderMode (\"senderid\" | \"number\"), and/or smsSenderNumber (string)",
      },
      { status: 400 },
    );
  }

  try {
    if (hasTemplate) {
      const raw: string = body.smsUpNextTemplate;
      await setSmsUpNextTemplate(raw.trim() === "" ? DEFAULT_SMS_UP_NEXT : raw);
    }
    if (hasLead) await setNotifyLead(body.smsNotifyLead);
    if (hasAllIn) await setAllIn(body.allIn);
    if (hasAutoSms) await setAutoSmsEnabled(body.autoSmsEnabled);
    if (hasSenderMode) await setSmsSenderMode(body.smsSenderMode);
    if (hasSenderNumber) await setSmsSenderNumber(body.smsSenderNumber);

    const [smsUpNextTemplate, smsNotifyLead, allIn, autoSmsEnabled, smsSenderMode, smsSenderNumber] =
      await Promise.all([
        getSmsUpNextTemplate(),
        getNotifyLead(),
        getAllIn(),
        getAutoSmsEnabled(),
        getSmsSenderMode(),
        getSmsSenderNumber(),
      ]);
    return NextResponse.json({
      ok: true,
      smsUpNextTemplate,
      smsNotifyLead,
      allIn,
      autoSmsEnabled,
      smsSenderMode,
      smsSenderNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
