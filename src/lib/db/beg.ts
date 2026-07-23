import "server-only";
import supabase from "@/lib/supabase";
import {
  BEG_THRESHOLD,
  BEG_CEILING,
  BEG_COOLDOWN_MATCHES,
  BEG_MAX_TOTAL,
  awardForAccuracy,
} from "@/lib/beg-config";

// Server-authoritative "beg for tokens" logic. The client only ever reports a
// dial accuracy (0..1); the server owns eligibility, the cooldown, the lifetime
// cap, the award math and the ceiling — so a tampered client can at most claim
// a perfect dial, still bounded by every rule below.

export type BegState = {
  tokens: number;
  threshold: number;
  ceiling: number;
  begsUsed: number;
  begsAllowed: number;
  /** null when ready now; otherwise how many more completed matches to wait. */
  cooldownRemaining: number | null;
  /** true only when under threshold, has begs left, and cooldown satisfied. */
  eligible: boolean;
  /** reason it's not eligible, for UI copy. */
  reason: "ok" | "not_broke" | "no_begs_left" | "cooldown";
};

async function countCompletedMatches(): Promise<number> {
  const { count, error } = await supabase
    .from("bracket_matches")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed");
  if (error) throw new Error(`Failed to count matches: ${error.message}`);
  return count ?? 0;
}

type UserBegRow = { tokens: number; beg_count: number; last_beg_match_count: number | null };

async function loadUser(userId: string): Promise<UserBegRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("tokens, beg_count, last_beg_match_count")
    .eq("id", userId)
    .limit(1);
  if (error) throw new Error(`Failed to load user: ${error.message}`);
  const r = data?.[0];
  if (!r) return null;
  return {
    tokens: (r.tokens as number) ?? 0,
    beg_count: (r.beg_count as number) ?? 0,
    last_beg_match_count: (r.last_beg_match_count as number | null) ?? null,
  };
}

function evaluate(user: UserBegRow, completed: number): BegState {
  const begsUsed = user.beg_count;
  const matchesSince =
    user.last_beg_match_count === null ? Infinity : completed - user.last_beg_match_count;
  const cooldownRemaining =
    matchesSince >= BEG_COOLDOWN_MATCHES ? null : BEG_COOLDOWN_MATCHES - matchesSince;

  let reason: BegState["reason"] = "ok";
  if (user.tokens >= BEG_THRESHOLD) reason = "not_broke";
  else if (begsUsed >= BEG_MAX_TOTAL) reason = "no_begs_left";
  else if (cooldownRemaining !== null) reason = "cooldown";

  return {
    tokens: user.tokens,
    threshold: BEG_THRESHOLD,
    ceiling: BEG_CEILING,
    begsUsed,
    begsAllowed: BEG_MAX_TOTAL,
    cooldownRemaining,
    eligible: reason === "ok",
    reason,
  };
}

export async function getBegState(userId: string): Promise<BegState> {
  const [user, completed] = await Promise.all([loadUser(userId), countCompletedMatches()]);
  if (!user) {
    // No pickabots users row yet → treat as a fresh player at the default 100.
    return {
      tokens: 100,
      threshold: BEG_THRESHOLD,
      ceiling: BEG_CEILING,
      begsUsed: 0,
      begsAllowed: BEG_MAX_TOTAL,
      cooldownRemaining: null,
      eligible: false,
      reason: "not_broke",
    };
  }
  return evaluate(user, completed);
}

export type BegResult =
  | { ok: true; awarded: number; tokens: number; begsUsed: number }
  | { ok: false; error: string; state: BegState };

/**
 * Attempt a beg with a client-reported dial `accuracy` (0..1). Re-checks every
 * rule server-side, computes the award, applies the ceiling cap, and records
 * the beg. Returns the granted amount + new balance, or an error + fresh state.
 */
export async function attemptBeg(userId: string, accuracy: number): Promise<BegResult> {
  const [user, completed] = await Promise.all([loadUser(userId), countCompletedMatches()]);

  // Materialise a row for a brand-new player so we can persist beg state.
  const effectiveUser: UserBegRow = user ?? { tokens: 100, beg_count: 0, last_beg_match_count: null };
  const state = evaluate(effectiveUser, completed);
  if (!state.eligible) {
    const msg =
      state.reason === "not_broke"
        ? `You can only beg when you have fewer than ${BEG_THRESHOLD} tokens.`
        : state.reason === "no_begs_left"
          ? "You've used all your begs."
          : `Wait ${state.cooldownRemaining} more match${state.cooldownRemaining === 1 ? "" : "es"} before begging again.`;
    return { ok: false, error: msg, state };
  }

  const safeAccuracy = Math.max(0, Math.min(1, Number.isFinite(accuracy) ? accuracy : 0));
  const skill = awardForAccuracy(safeAccuracy);
  const room = Math.max(0, BEG_CEILING - effectiveUser.tokens);
  const awarded = Math.min(skill, room);
  const newTokens = effectiveUser.tokens + awarded;
  const newBegCount = effectiveUser.beg_count + 1;

  if (user) {
    const { error } = await supabase
      .from("users")
      .update({ tokens: newTokens, beg_count: newBegCount, last_beg_match_count: completed })
      .eq("id", userId);
    if (error) throw new Error(`Failed to record beg: ${error.message}`);
  } else {
    const { error } = await supabase.from("users").insert({
      id: userId,
      tokens: newTokens,
      beg_count: newBegCount,
      last_beg_match_count: completed,
    });
    if (error) throw new Error(`Failed to record beg: ${error.message}`);
  }

  return { ok: true, awarded, tokens: newTokens, begsUsed: newBegCount };
}
