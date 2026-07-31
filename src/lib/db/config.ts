import "server-only";
import supabase from "@/lib/supabase";
import { DEFAULT_SMS_UP_NEXT } from "@/lib/sms-template";
import {
  DEFAULT_BEG_THRESHOLD,
  clampBegThreshold,
  DEFAULT_BEG_MAX_AWARD,
  clampBegMaxAward,
} from "@/lib/beg-config";

// Admin-editable key/value config (see migration 0009). Read/written via the
// service key only.

const SMS_UP_NEXT_KEY = "sms_up_next_template";
const NOTIFY_LEAD_KEY = "sms_notify_lead";
const ALL_IN_KEY = "all_in";
const AUTO_SMS_KEY = "auto_sms_enabled";
const SMS_SENDER_MODE_KEY = "sms_sender_mode";
const SMS_SENDER_NUMBER_KEY = "sms_sender_number";
const FINALS_DAY_KEY = "finals_day";
const BEG_THRESHOLD_KEY = "beg_threshold";
const BEG_MAX_AWARD_KEY = "beg_max_award";
const TEAM_STATUS_OVERRIDE_KEY = "team_status_overrides";

/** Default: text captains when their team is this many matches from playing. */
export const DEFAULT_NOTIFY_LEAD = 2;

export type SmsSenderMode = "senderid" | "number";
export const DEFAULT_SMS_SENDER_MODE: SmsSenderMode = "senderid";
/** Fallback "from" number while the alphanumeric sender ID isn't registered yet. */
export const DEFAULT_SMS_SENDER_NUMBER = "0435554607";

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
 * Finals Day mode. Switches the public site over to the last day of the event:
 * the bracket page opens on its Finals view, the match list shows the Finals Day
 * ring instead of the two division ladders, and every public page carries a gold
 * "Finals Day" banner.
 *
 * Purely presentational — it does NOT decide where finals matches live. Those
 * always sit on the shared Finals Day ring (see FinalsSchedule and
 * rollSchedule's schedulable), flag or no flag, so turning it on never moves a
 * match or rewrites a schedule.
 */
export async function getFinalsDay(): Promise<boolean> {
  try {
    return (await getConfig(FINALS_DAY_KEY)) === "true";
  } catch (err) {
    // Never let a config read failure break a public page — default to the
    // normal (non-finals) presentation.
    console.error("[config] getFinalsDay failed, defaulting to off:", err);
    return false;
  }
}

export async function setFinalsDay(value: boolean): Promise<void> {
  await setConfig(FINALS_DAY_KEY, value ? "true" : "false");
}

/**
 * The balance a player must be STRICTLY under to beg for RamCoin — i.e. how
 * broke "broke" is. Raise it to let players top up sooner (a generous safety
 * net), drop it to make begging a last resort. Clamped to
 * [BEG_THRESHOLD_MIN, BEG_THRESHOLD_MAX]; every other beg rule (lifetime cap,
 * cooldown, no-live-vote, the award ceiling) is unchanged by it.
 */
export async function getBegThreshold(): Promise<number> {
  try {
    const raw = await getConfig(BEG_THRESHOLD_KEY);
    return raw === null ? DEFAULT_BEG_THRESHOLD : clampBegThreshold(parseInt(raw, 10));
  } catch (err) {
    // Never let a config read failure break the beg dial — fall back to the
    // built-in threshold.
    console.error("[config] getBegThreshold failed, using default:", err);
    return DEFAULT_BEG_THRESHOLD;
  }
}

export async function setBegThreshold(value: number): Promise<void> {
  await setConfig(BEG_THRESHOLD_KEY, String(clampBegThreshold(value)));
}

/**
 * What a dead-centre beg pays out. The band edge still pays BEG_MIN_AWARD (or
 * this, whichever is smaller), and everything between scales linearly — see
 * `awardForAccuracy`. Also sets the award ceiling with the threshold, so raising
 * it makes begging more generous at both ends.
 */
export async function getBegMaxAward(): Promise<number> {
  try {
    const raw = await getConfig(BEG_MAX_AWARD_KEY);
    return raw === null ? DEFAULT_BEG_MAX_AWARD : clampBegMaxAward(parseInt(raw, 10));
  } catch (err) {
    // Never let a config read failure break the beg dial — fall back to the
    // built-in award.
    console.error("[config] getBegMaxAward failed, using default:", err);
    return DEFAULT_BEG_MAX_AWARD;
  }
}

export async function setBegMaxAward(value: number): Promise<void> {
  await setConfig(BEG_MAX_AWARD_KEY, String(clampBegMaxAward(value)));
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

/**
 * Which "from" texts are sent as: the alphanumeric sender ID (once
 * registered) or a plain mobile number (two-way, usable immediately). See
 * `resolveSmsFrom()` in `@/lib/sms.ts` for where this is applied.
 */
export async function getSmsSenderMode(): Promise<SmsSenderMode> {
  try {
    const raw = await getConfig(SMS_SENDER_MODE_KEY);
    return raw === "number" ? "number" : DEFAULT_SMS_SENDER_MODE;
  } catch (err) {
    console.error("[config] getSmsSenderMode failed, defaulting to sender ID:", err);
    return DEFAULT_SMS_SENDER_MODE;
  }
}

export async function setSmsSenderMode(value: SmsSenderMode): Promise<void> {
  await setConfig(SMS_SENDER_MODE_KEY, value);
}

/** The mobile number used as "from" when `getSmsSenderMode()` is `"number"`. */
export async function getSmsSenderNumber(): Promise<string> {
  try {
    return (await getConfig(SMS_SENDER_NUMBER_KEY)) || DEFAULT_SMS_SENDER_NUMBER;
  } catch (err) {
    console.error("[config] getSmsSenderNumber failed, using default:", err);
    return DEFAULT_SMS_SENDER_NUMBER;
  }
}

export async function setSmsSenderNumber(value: string): Promise<void> {
  await setConfig(SMS_SENDER_NUMBER_KEY, value.trim());
}

/**
 * Manual "is this team still in it?" overrides for the public teams leaderboard,
 * keyed by `teams.id` → `true` = force eliminated, `false` = force still in.
 * A team with no entry is untouched: its status stays derived from the bracket
 * (see computeTeamsLeaderboard), which is the normal case.
 *
 * The escape hatch for a bracket whose recorded results can't support the
 * derived two-loss rule — an unrecorded loss leaves a team reading as alive, a
 * bogus one knocks out a team that's still playing. Stored here as one JSON blob
 * rather than a column on pickabots_team_state purely because this table needs
 * no migration; the shape is per-team so it can be lifted into a real column
 * (and an admin toggle) later without changing the meaning.
 */
export type TeamStatusOverrides = Record<string, boolean>;

export async function getTeamStatusOverrides(): Promise<TeamStatusOverrides> {
  try {
    const raw = await getConfig(TEAM_STATUS_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // Keep only the boolean entries, so a hand-edited blob with junk in it
    // degrades to "no override" per team instead of breaking the whole board.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => typeof v === "boolean"),
    ) as TeamStatusOverrides;
  } catch (err) {
    // Never let a bad blob take down the leaderboard — fall back to the
    // bracket-derived statuses.
    console.error("[config] getTeamStatusOverrides failed, ignoring overrides:", err);
    return {};
  }
}

export async function setTeamStatusOverrides(value: TeamStatusOverrides): Promise<void> {
  await setConfig(TEAM_STATUS_OVERRIDE_KEY, JSON.stringify(value));
}
