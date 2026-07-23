import "server-only";

// ─────────────────────────────────────────────────────────────────────────
//  SMS adapter — provider-agnostic seam.
//
//  Only this file knows which SMS provider we use. Everything else calls
//  `sendSms()` / `sendManySms()` against the provider-neutral shape below, so
//  swapping ClickSend for Telnyx/MessageMedia/etc. is a one-file change.
//
//  Current provider: ClickSend (https://developers.clicksend.com/docs/rest/v3/).
//  Chosen because AU delivery is first-class, it needs no rented number, and it
//  supports an alphanumeric sender ID ("RAMSOC") out of the box. Note: an
//  alphanumeric sender is ONE-WAY — recipients cannot reply.
//
//  Env:
//    CLICKSEND_USERNAME   ClickSend account username
//    CLICKSEND_API_KEY    ClickSend API key
//    SMS_SENDER           sender ID shown on recipients' phones (default RAMSOC,
//                         max 11 chars, letters/digits, no spaces)
// ─────────────────────────────────────────────────────────────────────────

export type SmsMessage = {
  to: string;
  body: string;
};

export type SmsResult = {
  to: string;
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  error?: string;
};

const DEFAULT_SENDER = "RAMSOC";

/** The sender ID recipients see. Trimmed to ClickSend's 11-char alphanumeric limit. */
export function smsSender(): string {
  const raw = (process.env.SMS_SENDER || DEFAULT_SENDER).replace(/[^A-Za-z0-9]/g, "");
  return raw.slice(0, 11) || DEFAULT_SENDER;
}

/** True when provider credentials are configured; false ⇒ sends are skipped (dry-run). */
export function smsConfigured(): boolean {
  return Boolean(process.env.CLICKSEND_USERNAME && process.env.CLICKSEND_API_KEY);
}

/**
 * Normalise an AU mobile number to E.164 (+61…). Accepts "0412 345 678",
 * "0412345678", "+61412345678", "61412345678". Returns null if it doesn't look
 * like a mobile number we can send to.
 */
export function normaliseAuMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+61")) return digits.length === 12 ? digits : null;
  if (digits.startsWith("61")) return digits.length === 11 ? `+${digits}` : null;
  if (digits.startsWith("04")) return digits.length === 10 ? `+61${digits.slice(1)}` : null;
  // Bare 9-digit mobile without leading 0 (e.g. "412345678").
  if (digits.startsWith("4") && digits.length === 9) return `+61${digits}`;
  return null;
}

type ClickSendMessageResult = { to?: string; status?: string; custom_string?: string };
type ClickSendResponse = {
  response_code?: string;
  response_msg?: string;
  data?: { messages?: ClickSendMessageResult[] };
};

/** Send a batch of messages. Never throws — every recipient gets a result row. */
export async function sendManySms(messages: SmsMessage[]): Promise<SmsResult[]> {
  const clean = messages
    .map((m) => ({ raw: m, to: normaliseAuMobile(m.to) }))
    .filter((m) => m.body ?? true);

  // Anything that failed number normalisation is reported as skipped up-front.
  const skipped: SmsResult[] = clean
    .filter((m) => !m.to)
    .map((m) => ({ to: m.raw.to, ok: false, status: "skipped", error: "Invalid/unknown mobile number" }));

  const sendable = clean.filter((m) => m.to) as { raw: SmsMessage; to: string }[];
  if (sendable.length === 0) return skipped;

  if (!smsConfigured()) {
    return [
      ...skipped,
      ...sendable.map<SmsResult>((m) => ({
        to: m.raw.to,
        ok: false,
        status: "skipped",
        error: "SMS provider not configured (set CLICKSEND_USERNAME / CLICKSEND_API_KEY)",
      })),
    ];
  }

  const from = smsSender();
  const auth = Buffer.from(
    `${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`,
  ).toString("base64");

  try {
    const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: sendable.map((m, i) => ({
          source: "pickabots",
          from,
          to: m.to,
          body: m.raw.body,
          custom_string: String(i),
        })),
      }),
    });

    const json = (await res.json().catch(() => ({}))) as ClickSendResponse;

    if (!res.ok || json.response_code !== "SUCCESS") {
      const err = json.response_msg || `ClickSend error (HTTP ${res.status})`;
      return [
        ...skipped,
        ...sendable.map<SmsResult>((m) => ({ to: m.to, ok: false, status: "failed", error: err })),
      ];
    }

    const results = json.data?.messages ?? [];
    return [
      ...skipped,
      ...sendable.map<SmsResult>((m, i) => {
        const r = results[i] ?? results.find((x) => x.custom_string === String(i));
        const status = (r?.status ?? "").toUpperCase();
        const ok = status === "SUCCESS" || status === "QUEUED";
        return {
          to: m.to,
          ok,
          status: ok ? "sent" : "failed",
          error: ok ? undefined : r?.status || "Unknown provider status",
        };
      }),
    ];
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error contacting SMS provider";
    return [
      ...skipped,
      ...sendable.map<SmsResult>((m) => ({ to: m.to, ok: false, status: "failed", error: message })),
    ];
  }
}

/** Convenience single-recipient send. */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const [result] = await sendManySms([{ to, body }]);
  return result;
}
