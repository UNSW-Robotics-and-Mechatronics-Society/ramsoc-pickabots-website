import type { Division } from "@/lib/mock-data";

/**
 * Seed uniqueness — one rule, used everywhere it's enforced.
 *
 * A seed must be unique within a division: Auto Fill orders teams by seed, and
 * two teams sharing one have no defined order between them, so the bracket it
 * would produce is arbitrary. This module is deliberately pure and free of
 * `server-only` so the same function backs all three checks — the inline flag in
 * the Teams list, the client-side guards on Auto Fill and seed import, and the
 * authoritative server check in the PATCH/bulk routes. Three separate
 * implementations would drift.
 */

export type SeedHolder = { id: string; name: string; division: Division; seed: number | null };
export type SeedConflict = { division: Division; seed: number; teams: { id: string; name: string }[] };

/**
 * Seeds landing on more than one team within a division.
 *
 * `onlyInvolving` limits the result to conflicts that at least one of those team
 * ids is part of. The server passes the ids being assigned, so a duplicate
 * already sitting in the table — from before this was enforced — can't block an
 * unrelated edit to some other team. Omit it to report every conflict.
 */
export function computeSeedConflicts(holders: SeedHolder[], onlyInvolving?: Set<string>): SeedConflict[] {
  const byDivision = new Map<Division, Map<number, { id: string; name: string }[]>>();
  for (const h of holders) {
    if (h.seed == null) continue;
    const perSeed = byDivision.get(h.division) ?? new Map<number, { id: string; name: string }[]>();
    perSeed.set(h.seed, [...(perSeed.get(h.seed) ?? []), { id: h.id, name: h.name }]);
    byDivision.set(h.division, perSeed);
  }

  const out: SeedConflict[] = [];
  for (const [division, perSeed] of byDivision) {
    for (const [seed, teams] of perSeed) {
      if (teams.length < 2) continue;
      if (onlyInvolving && !teams.some(t => onlyInvolving.has(t.id))) continue;
      out.push({ division, seed, teams });
    }
  }
  return out.sort((a, b) => (a.division === b.division ? a.seed - b.seed : a.division.localeCompare(b.division)));
}

/** One-line summary for an error message: "Standards seed 3 — Voltage, Iron Fist". */
export function describeSeedConflicts(
  conflicts: SeedConflict[],
  label: Record<Division, string>,
): string {
  if (conflicts.length === 0) return 'Another team already has that seed.';
  return conflicts
    .map(c => `${label[c.division]} seed ${c.seed} — ${c.teams.map(t => t.name).join(', ')}`)
    .join('; ');
}

// ── Round 1 seeding ──────────────────────────────────────────────────────────

/**
 * How Auto Fill lays out WB Round 1.
 *
 *  - 'worst-plays-best'  — standard balanced seeding: seed 1 faces the weakest
 *    team, seed 2 the next weakest, and the top two seeds sit in opposite halves
 *    so they can only meet in the final.
 *  - 'worst-plays-first' — seeds run strictly descending down the bracket, so
 *    the two weakest teams share the top match and seeds 1 and 2 share the
 *    bottom one. Combined with top-to-bottom play order that makes the weakest
 *    match the first played and seed 1 v seed 2 the last of the round.
 */
export type AutoFillMode = 'worst-plays-best' | 'worst-plays-first';

/**
 * Balanced seeding order over bracket POSITIONS (1 = top seed): expands
 * recursively so position 1 lands in M1 and position 2 in M_last (opposite
 * halves). For 8 matches → [1,8,5,4,3,6,7,2], i.e. M1 = 1v16, M2 = 8v9, … with
 * slotB of each match = T+1 − slotA.
 */
export function seedOrder(N: number): number[] {
  let seeds = [1];
  let tc = 2;
  while (seeds.length < N) {
    const next: number[] = [];
    for (let p = 0; p < seeds.length; p++) {
      const s = seeds[p], comp = tc + 1 - s;
      if (p % 2 === 0) { next.push(s, comp); } else { next.push(comp, s); }
    }
    seeds = next;
    tc *= 2;
  }
  return seeds;
}

/**
 * The team names for each WB Round 1 match, indexed by match number − 1
 * (out[0] = M1 = top of the bracket). `ranked` is every in-bracket team's name
 * strongest-first, so ranked[0] is seed 1; it may be shorter than the bracket's
 * 2 × numMatches slots, and the leftover slots come back as ''. A match with one
 * name is a bye, one with neither is an unused slot — completeRound1Byes and the
 * scheduler both read it that way, so this function only has to place names.
 *
 * Both modes are here together so the two layouts stay comparable, and so the
 * empty-slot placement (which decides who gets a bye) is visible side by side.
 */
export function round1Pairs(
  mode: AutoFillMode,
  ranked: string[],
  numMatches: number,
): { a: string; b: string }[] {
  if (mode === 'worst-plays-best') {
    // Position p faces position T+1−p, and seedOrder says which position takes
    // slot A of each match. Absent teams are the LAST positions (T, T−1, …),
    // which sit opposite positions 1, 2, … — so byes fall to the top seeds.
    const T = 2 * numMatches;
    return seedOrder(numMatches).map(aPos => ({
      a: ranked[aPos - 1] ?? '',
      b: ranked[T - aPos] ?? '',   // (T + 1 − aPos) − 1
    }));
  }

  // 'worst-plays-first': adjacent seeds meet, weakest pair at the top —
  // (n, n−1), (n−2, n−3), … — which leaves the top seeds without a partner to
  // pair off against. To keep byes on the strongest teams (same rule as the
  // other mode) each of those seeds gets a match of its own at the BOTTOM of the
  // round, seed 1 in the very last one. Reading the round top to bottom is then
  // still strictly worst → best, and because R1 M2k−1/M2k feed R2 Mk, the bye
  // seeds pair off in R2 exactly as they would have here: 1 v 2 last again.
  const n        = ranked.length;
  const contested = Math.max(0, n - numMatches);   // matches with two teams
  const byes      = n - 2 * contested;             // matches with one team
  const unused    = numMatches - contested - byes; // matches with neither

  const out: { a: string; b: string }[] = [];
  // Fewer teams than matches: the surplus matches are dead, and they go at the
  // top so the teams that are present still read worst → best downwards.
  for (let i = 0; i < unused; i++) out.push({ a: '', b: '' });
  for (let r = 0; r < contested; r++) {
    const weaker = n - 1 - 2 * r;
    out.push({ a: ranked[weaker], b: ranked[weaker - 1] });
  }
  for (let b = byes; b >= 1; b--) out.push({ a: ranked[b - 1], b: '' });
  return out;
}
