// Shared beg-feature constants + pure award math. Client-safe (NO "server-only"):
// imported by both the BegDial UI and the server beg logic so the rules live in
// exactly one place.

/**
 * You may only beg while STRICTLY below this token balance. Admin-tunable in the
 * Settings panel (config key `beg_threshold`) — this is only the fallback used
 * when nothing is saved, so read the live value off the beg state (`threshold`)
 * rather than importing this constant into product logic.
 */
export const DEFAULT_BEG_THRESHOLD = 10;

/** Range the admin may set the threshold within. */
export const BEG_THRESHOLD_MIN = 1;
export const BEG_THRESHOLD_MAX = 500;

/** Rounds + clamps an admin-supplied threshold; junk falls back to the default. */
export function clampBegThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BEG_THRESHOLD;
  return Math.min(BEG_THRESHOLD_MAX, Math.max(BEG_THRESHOLD_MIN, Math.trunc(value)));
}

/**
 * A perfect dial (dead-centre) awards this many tokens. Admin-tunable in the
 * Settings panel (config key `beg_max_award`) — as with the threshold, this is
 * only the fallback, so product logic should read `maxAward` off the beg state.
 */
export const DEFAULT_BEG_MAX_AWARD = 20;

/** Range the admin may set the bullseye award within. */
export const BEG_MAX_AWARD_MIN = 1;
export const BEG_MAX_AWARD_MAX = 500;

/** Rounds + clamps an admin-supplied bullseye award; junk falls back to the default. */
export function clampBegMaxAward(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BEG_MAX_AWARD;
  return Math.min(BEG_MAX_AWARD_MAX, Math.max(BEG_MAX_AWARD_MIN, Math.trunc(value)));
}

/** Just inside the target band awards this many (the floor for a non-miss). */
export const BEG_MIN_AWARD = 6;

/**
 * The band-edge award for a given bullseye award. Normally the flat
 * BEG_MIN_AWARD, but it can't exceed the bullseye itself — an admin who sets the
 * max to 3 gets a flat 3 for any hit rather than an edge that pays more than a
 * dead-centre one.
 */
export function begMinAwardFor(maxAward: number): number {
  return Math.min(BEG_MIN_AWARD, clampBegMaxAward(maxAward));
}

/**
 * Fairness cap: a beg can NEVER raise your balance above this. The granted
 * amount is min(skill award, ceiling − current balance). Begging is a safety
 * net to stay in the game — it can't out-earn a player who conserved tokens.
 *
 * Derived from the two admin settings rather than fixed, so the cap always
 * leaves room for a full-value beg: anyone eligible (under the threshold) can
 * win the whole bullseye award, and nobody can be lifted further than that past
 * the point where begging unlocks.
 */
export function begCeilingFor(threshold: number, maxAward: number): number {
  return clampBegThreshold(threshold) + clampBegMaxAward(maxAward);
}

/** Completed bracket matches that must pass between one beg and the next. */
export const BEG_COOLDOWN_MATCHES = 3;

/** Lifetime cap on how many times a single player may beg (bump to 3 if needed). */
export const BEG_MAX_TOTAL = 2;

/**
 * Maps dial accuracy → skill award (before the ceiling cap), for the admin's
 * current `maxAward`. At the default 20:
 *   accuracy <= 0  → 0    (missed the band entirely)
 *   accuracy → 0+  → ~6   (just inside the band edge)
 *   accuracy = 1   → 20   (dead centre / bullseye)
 * `accuracy` is a 0..1 value the client derives from how close the needle
 * stopped to the band centre.
 */
export function awardForAccuracy(accuracy: number, maxAward: number): number {
  if (!(accuracy > 0)) return 0;
  const max = clampBegMaxAward(maxAward);
  const min = begMinAwardFor(max);
  const a = Math.min(1, accuracy);
  return Math.round(min + a * (max - min));
}
