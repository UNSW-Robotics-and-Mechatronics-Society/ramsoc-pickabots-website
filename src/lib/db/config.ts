import "server-only";
import supabase from "@/lib/supabase";
import { DEFAULT_SMS_UP_NEXT } from "@/lib/sms-template";

// Admin-editable key/value config (see migration 0009). Read/written via the
// service key only.

const SMS_UP_NEXT_KEY = "sms_up_next_template";
const NOTIFY_LEAD_KEY = "sms_notify_lead";
const ALL_IN_KEY = "all_in";
const AUTO_SMS_KEY = "auto_sms_enabled";

/** Default: text captains when their team is this many matches from playing. */
export const DEFAULT_NOTIFY_LEAD = 2;

async function getConfig(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("pickabots_config")
    .select("value")
    .eq("key", key)
    .limit(1);
  if (error) throw new Error(`Failed to read config "${key}": ${error.message}`);
  return (data?.[0]?.value as string | undefined) ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from("pickabots_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Failed to save config "${key}": ${error.message}`);
}

/** The current "up next" SMS template, falling back to the built-in default. */
export async function getSmsUpNextTemplate(): Promise<string> {
  try {
    return (await getConfig(SMS_UP_NEXT_KEY)) || DEFAULT_SMS_UP_NEXT;
  } catch (err) {
    // Never let a config read failure break sending — fall back to the default.
    console.error("[config] getSmsUpNextTemplate failed, using default:", err);
    return DEFAULT_SMS_UP_NEXT;
  }
}

export async function setSmsUpNextTemplate(value: string): Promise<void> {
  await setConfig(SMS_UP_NEXT_KEY, value);
}

/** How many matches ahead of playing to text a team's captains. Clamped ≥1. */
export async function getNotifyLead(): Promise<number> {
  try {
    const raw = await getConfig(NOTIFY_LEAD_KEY);
    const n = raw === null ? DEFAULT_NOTIFY_LEAD : parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_NOTIFY_LEAD;
  } catch (err) {
    console.error("[config] getNotifyLead failed, using default:", err);
    return DEFAULT_NOTIFY_LEAD;
  }
}

export async function setNotifyLead(value: number): Promise<void> {
  const n = Math.max(1, Math.min(16, Math.trunc(value)));
  await setConfig(NOTIFY_LEAD_KEY, String(n));
}

/**
 * "ALL IN" mode: when on, the 50%-of-balance-per-vote cap is lifted (players
 * can stake up to their whole balance). Enforced server-side in the place_vote
 * RPC (see migration 0020); this getter mirrors the flag for the UI.
 */
export async function getAllIn(): Promise<boolean> {
  try {
    return (await getConfig(ALL_IN_KEY)) === "true";
  } catch (err) {
    // Never let a config read failure break the voting page — default to the
    // safe (capped) behaviour.
    console.error("[config] getAllIn failed, defaulting to off:", err);
    return false;
  }
}

export async function setAllIn(value: boolean): Promise<void> {
  await setConfig(ALL_IN_KEY, value ? "true" : "false");
}

/**
 * Auto captain texts: when off, the automatic "your match is up next" SMS
 * pass (triggered on every bracket save, see saveBracketState) is skipped
 * entirely — for dev/testing so repeated bracket edits don't spam real
 * captains. Manual sends (the "up next" button, broadcast, test numbers)
 * are unaffected — this only gates the automatic trigger. Defaults ON.
 */
export async function getAutoSmsEnabled(): Promise<boolean> {
  try {
    const raw = await getConfig(AUTO_SMS_KEY);
    return raw === null ? true : raw === "true";
  } catch (err) {
    // Never let a config read failure silently suppress real alerts —
    // default to the safe (enabled) behaviour.
    console.error("[config] getAutoSmsEnabled failed, defaulting to on:", err);
    return true;
  }
}

export async function setAutoSmsEnabled(value: boolean): Promise<void> {
  await setConfig(AUTO_SMS_KEY, value ? "true" : "false");
}
