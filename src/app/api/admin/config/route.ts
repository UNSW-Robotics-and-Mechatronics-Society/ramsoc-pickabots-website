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
  getFinalsDay,
  setFinalsDay,
  getBegThreshold,
  setBegThreshold,
  getBegMaxAward,
  setBegMaxAward,
} from "@/lib/db/config";
import { DEFAULT_SMS_UP_NEXT } from "@/lib/sms-template";
import {
  BEG_THRESHOLD_MIN,
  BEG_THRESHOLD_MAX,
  BEG_MAX_AWARD_MIN,
  BEG_MAX_AWARD_MAX,
} from "@/lib/beg-config";

// Every admin-editable setting, read in one pass. Shared by GET and the
// post-save echo in PUT so the two can't drift as settings are added.
async function readAll() {
  const [
    smsUpNextTemplate,
    smsNotifyLead,
    allIn,
    autoSmsEnabled,
    smsSenderMode,
    smsSenderNumber,
    finalsDay,
    begThreshold,
    begMaxAward,
  ] = await Promise.all([
    getSmsUpNextTemplate(),
    getNotifyLead(),
    getAllIn(),
    getAutoSmsEnabled(),
    getSmsSenderMode(),
    getSmsSenderNumber(),
    getFinalsDay(),
    getBegThreshold(),
    getBegMaxAward(),
  ]);
  return {
    smsUpNextTemplate,
    smsNotifyLead,
    allIn,
    autoSmsEnabled,
    smsSenderMode,
    smsSenderNumber,
    finalsDay,
    begThreshold,
    begMaxAward,
  };
}

// GET → current admin-editable config.
export async function GET() {
  const user = await currentUser();
  if (!isAdminUser(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({
      ...(await readAll()),
      smsUpNextDefault: DEFAULT_SMS_UP_NEXT,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PUT { smsUpNextTemplate?, smsNotifyLead?, allIn?, autoSmsEnabled?,
// begThreshold?, begMaxAward?, … } → save whichever fields are given. An empty
// template string resets it to the built-in default.
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
  const hasFinalsDay = typeof body?.finalsDay === "boolean";
  const hasBegThreshold = typeof body?.begThreshold === "number" && Number.isFinite(body.begThreshold);
  const hasBegMaxAward = typeof body?.begMaxAward === "number" && Number.isFinite(body.begMaxAward);
  if (
    !hasTemplate && !hasLead && !hasAllIn && !hasAutoSms && !hasSenderMode &&
    !hasSenderNumber && !hasFinalsDay && !hasBegThreshold && !hasBegMaxAward
  ) {
    return NextResponse.json(
      {
        error:
          "provide smsUpNextTemplate (string), smsNotifyLead (number), allIn (boolean), autoSmsEnabled (boolean), smsSenderMode (\"senderid\" | \"number\"), smsSenderNumber (string), finalsDay (boolean), begThreshold (number), and/or begMaxAward (number)",
      },
      { status: 400 },
    );
  }
  // Out-of-range is rejected rather than silently clamped — an admin typing 5000
  // should be told the ceiling, not quietly given 500.
  if (
    hasBegThreshold &&
    (body.begThreshold < BEG_THRESHOLD_MIN || body.begThreshold > BEG_THRESHOLD_MAX)
  ) {
    return NextResponse.json(
      { error: `begThreshold must be between ${BEG_THRESHOLD_MIN} and ${BEG_THRESHOLD_MAX}` },
      { status: 400 },
    );
  }
  if (
    hasBegMaxAward &&
    (body.begMaxAward < BEG_MAX_AWARD_MIN || body.begMaxAward > BEG_MAX_AWARD_MAX)
  ) {
    return NextResponse.json(
      { error: `begMaxAward must be between ${BEG_MAX_AWARD_MIN} and ${BEG_MAX_AWARD_MAX}` },
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
    if (hasFinalsDay) await setFinalsDay(body.finalsDay);
    if (hasBegThreshold) await setBegThreshold(body.begThreshold);
    if (hasBegMaxAward) await setBegMaxAward(body.begMaxAward);

    return NextResponse.json({ ok: true, ...(await readAll()) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
