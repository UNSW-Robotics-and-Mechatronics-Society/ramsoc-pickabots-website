// Shared beg-feature constants + pure award math. Client-safe (NO "server-only"):
// imported by both the BegDial UI and the server beg logic so the rules live in
// exactly one place.

/** You may only beg while STRICTLY below this token balance. */
export const BEG_THRESHOLD = 10;

/** A perfect dial (dead-centre) awards this many tokens. */
export const BEG_MAX_AWARD = 20;

/** Just inside the target band awards this many (the floor for a non-miss). */
export const BEG_MIN_AWARD = 6;

/**
 * Fairness cap: a beg can NEVER raise your balance above this. The granted
 * amount is min(skill award, ceiling − current balance). Begging is a safety
 * net to stay in the game — it can't out-earn a player who conserved tokens.
 */
export const BEG_CEILING = 25;

/** Completed bracket matches that must pass between one beg and the next. */
export const BEG_COOLDOWN_MATCHES = 3;

/** Lifetime cap on how many times a single player may beg (bump to 3 if needed). */
export const BEG_MAX_TOTAL = 2;

/**
 * Maps dial accuracy → skill award (before the ceiling cap).
 *   accuracy <= 0  → 0    (missed the band entirely)
 *   accuracy → 0+  → ~6   (just inside the band edge)
 *   accuracy = 1   → 20   (dead centre / bullseye)
 * `accuracy` is a 0..1 value the client derives from how close the needle
 * stopped to the band centre.
 */
export function awardForAccuracy(accuracy: number): number {
  if (!(accuracy > 0)) return 0;
  const a = Math.min(1, accuracy);
  return Math.round(BEG_MIN_AWARD + a * (BEG_MAX_AWARD - BEG_MIN_AWARD));
}
