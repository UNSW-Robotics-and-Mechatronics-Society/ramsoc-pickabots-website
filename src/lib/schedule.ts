import { type BracketMatch, type Division, type MatchStatus } from "@/lib/mock-data";

export type ConcurrentRings = 1 | 2 | 3 | 4;

export const DEFAULT_MATCH_MINUTES = 5;
export const DEFAULT_GAP_MINUTES   = 5;
export const START_MINUTE          = 13 * 60; // 1:00 PM = 780

/** One match's place in a ring's own timeline. */
export type RingMatch = { matchId: string; startMinute: number };

/**
 * Each ring runs its own independent queue of matches. Rings are NOT
 * synchronized to shared rows — this lets a completed match's time stay
 * frozen (see changeTimings) and lets a newly added ring start from "now"
 * instead of the top (see changeRings), both per-ring rather than global.
 */
export type MatchSchedule = {
  rings: RingMatch[][];   // rings[ringIndex] = that ring's ordered queue
  concurrentRings: ConcurrentRings;
  matchMinutes: number;
  gapMinutes: number;
};

/**
 * Dedicated rings for ad-hoc exhibition matches — a single set, shared
 * across both divisions (not one copy per division): an exhibition match's
 * bracket `division` field is a technical leftover (the DB still requires
 * one) with no bearing on where it shows up. The admin adds these rings/
 * matches by hand; the bracket roller (rollSchedule) never puts bracket
 * matches into them and never touches this schedule at all.
 */
export type ExhibitionSchedule = {
  rings: RingMatch[][];
  matchMinutes: number;
  gapMinutes: number;
};

/**
 * Derives active/next/todo statuses from the schedule for one division.
 * Each ring is independent: the first non-completed/non-skipped match in
 * that ring's own queue → active, the second → next. This guarantees at most
 * one active and one next match PER RING (so the totals never exceed the ring
 * count). Completed and skipped statuses are always preserved.
 *
 * Shared by the admin editor and the public bracket / match-list views so all
 * three show the same, ring-capped statuses.
 */
export function applyScheduleStatus(
  matches: BracketMatch[],
  schedule: MatchSchedule,
  division: Division,
): BracketMatch[] {
  const byId = new Map(matches.map(m => [m.id, m]));

  const activeSet = new Set<string>();
  const nextSet   = new Set<string>();

  for (const ring of schedule.rings) {
    // Only READY matches (both teams known) can be active/next — an upcoming
    // match whose teams aren't decided yet is shown for its schedule slot but
    // stays "to-do", never a "waiting" active/biddable match.
    const readyPending = ring
      .map(e => e.matchId)
      .filter(id => {
        const m = byId.get(id);
        return m && m.status !== 'completed' && m.status !== 'skipped'
          && !!m.slotA.teamName && !!m.slotB.teamName;
      });
    if (readyPending[0]) activeSet.add(readyPending[0]);
    if (readyPending[1]) nextSet.add(readyPending[1]);
  }

  return matches.map(m => {
    // Exhibition matches are never touched here — they're not in
    // schedule.rings at all (see ExhibitionSchedule), but their `division`
    // field is still a real (if vestigial) Division value, so without this
    // check they'd match `m.division === division` and get force-reset to
    // 'todo' below simply because they don't appear in this ring set.
    if (m.division !== division || m.side === 'exhibition') return m;
    if (m.status === 'completed' || m.status === 'skipped') return m;

    const newStatus: MatchStatus =
      activeSet.has(m.id) ? 'active' :
      nextSet.has(m.id)   ? 'next'   :
      'todo';

    // Whenever a match first becomes active, always start with voting closed.
    // The admin explicitly opens it — this prevents the old default (open) from
    // leaking in from stored data or from a match that was previously active.
    if (newStatus === 'active' && m.status !== 'active') {
      return { ...m, status: 'active', votingOpen: false };
    }

    return m.status === newStatus ? m : { ...m, status: newStatus };
  });
}

export function formatTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

export function parseTimeInput(raw: string, fallback: number): number {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return fallback;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3];
  if (period === 'pm' && h !== 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return fallback;
  return h * 60 + min;
}

function slotDuration(s: Pick<MatchSchedule, 'matchMinutes' | 'gapMinutes'>): number {
  return s.matchMinutes + s.gapMinutes;
}

function isCompleted(matches: BracketMatch[], matchId: string): boolean {
  return matches.find(m => m.id === matchId)?.status === 'completed';
}

/** Distribute a flat id order round-robin across `rings` queues, timed sequentially from startMinute. */
function buildRings(ids: string[], rings: ConcurrentRings, startMinute: number, slotMin: number): RingMatch[][] {
  const out: RingMatch[][] = Array.from({ length: rings }, () => []);
  ids.forEach((id, i) => {
    const ri  = i % rings;
    const idx = out[ri].length;
    out[ri].push({ matchId: id, startMinute: startMinute + idx * slotMin });
  });
  return out;
}

export function generateSchedule(
  matchIds: string[],
  rings: ConcurrentRings = 2,
  startMinute: number = START_MINUTE,
  matchMinutes: number = DEFAULT_MATCH_MINUTES,
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): MatchSchedule {
  return {
    rings: buildRings(matchIds, rings, startMinute, matchMinutes + gapMinutes),
    concurrentRings: rings,
    matchMinutes,
    gapMinutes,
  };
}

/**
 * Redistribute matches into a new ring count. Completed matches stay exactly
 * where they are (front of their ring's queue); every not-yet-completed
 * match is redistributed across the new ring count. A newly added ring's
 * first match starts at "now" — the earliest currently-pending match's time
 * across all rings — rather than from the top of the day.
 */
export function changeRings(
  schedule: MatchSchedule,
  matches: BracketMatch[],
  newRings: ConcurrentRings,
): MatchSchedule {
  const dur = slotDuration(schedule);

  const completedByRing: RingMatch[][] = schedule.rings.map(ring =>
    ring.filter(e => isCompleted(matches, e.matchId)),
  );
  const pending = schedule.rings.flatMap(ring => ring.filter(e => !isCompleted(matches, e.matchId)));

  const now = pending.length > 0
    ? Math.min(...pending.map(e => e.startMinute))
    : (schedule.rings[0]?.[0]?.startMinute ?? START_MINUTE);

  const rings: RingMatch[][] = Array.from({ length: newRings }, (_, ri) => [...(completedByRing[ri] ?? [])]);

  pending.forEach((entry, i) => {
    const ri = i % newRings;
    const completedCount = completedByRing[ri]?.length ?? 0;
    const idxInPending    = rings[ri].length - completedCount;
    const base = completedCount > 0
      ? completedByRing[ri][completedCount - 1].startMinute + dur
      : now;
    rings[ri].push({ matchId: entry.matchId, startMinute: base + idxInPending * dur });
  });

  return { rings, concurrentRings: newRings, matchMinutes: schedule.matchMinutes, gapMinutes: schedule.gapMinutes };
}

/**
 * Change match length and/or gap. Completed matches keep their exact time;
 * every match after the last completed one in its ring reflows using the
 * new duration.
 */
export function changeTimings(
  schedule: MatchSchedule,
  matches: BracketMatch[],
  matchMinutes: number,
  gapMinutes: number,
): MatchSchedule {
  const dur = matchMinutes + gapMinutes;
  const rings = schedule.rings.map(ring => {
    let cursor: number | null = null;
    return ring.map(entry => {
      if (isCompleted(matches, entry.matchId)) {
        cursor = entry.startMinute + dur;
        return entry; // frozen
      }
      const startMinute = cursor ?? entry.startMinute;
      cursor = startMinute + dur;
      return { ...entry, startMinute };
    });
  });
  return { rings, concurrentRings: schedule.concurrentRings, matchMinutes, gapMinutes };
}

/**
 * Swap two matches wherever they are — their time slots swap, match IDs
 * trade places. Generic over any ring-based schedule (bracket or exhibition).
 */
export function swapMatchIds<T extends { rings: RingMatch[][] }>(schedule: T, idA: string, idB: string): T {
  function find(id: string) {
    for (let ri = 0; ri < schedule.rings.length; ri++) {
      const idx = schedule.rings[ri].findIndex(e => e.matchId === id);
      if (idx !== -1) return { ri, idx };
    }
    return null;
  }
  const posA = find(idA);
  const posB = find(idB);
  if (!posA || !posB || (posA.ri === posB.ri && posA.idx === posB.idx)) return schedule;

  const rings = schedule.rings.map(ring => [...ring]);
  const entryA = rings[posA.ri][posA.idx];
  const entryB = rings[posB.ri][posB.idx];
  rings[posA.ri][posA.idx] = { ...entryA, matchId: entryB.matchId };
  rings[posB.ri][posB.idx] = { ...entryB, matchId: entryA.matchId };

  return { ...schedule, rings };
}

/**
 * Edit one match's time and cascade forward through the rest of its own ring
 * only. Generic over any ring-based schedule (bracket or exhibition).
 */
export function editMatchTime<T extends { rings: RingMatch[][]; matchMinutes: number; gapMinutes: number }>(
  schedule: T,
  matchId: string,
  newMinute: number,
): T {
  const dur = slotDuration(schedule);
  const rings = schedule.rings.map(ring => {
    const idx = ring.findIndex(e => e.matchId === matchId);
    if (idx === -1) return ring;
    return ring.map((e, i) => i < idx ? e : { ...e, startMinute: newMinute + (i - idx) * dur });
  });
  return { ...schedule, rings };
}

/**
 * Rolling schedule. Playable matches (both teams known, or already played) are
 * laid out first and get the early time slots; the still-upcoming matches (teams
 * TBD) are appended after them so you can still see roughly when future rounds
 * play — but they always sort last, so ready matches keep the early slots and
 * (via applyScheduleStatus's readiness check) an upcoming match is never made
 * active/biddable. This is what keeps adding rings safe: only ready matches can
 * ever be active, so extra rings never surface "waiting" active matches.
 *
 * Rules per division:
 *  - Keep existing placements (order, times, manual reordering) for ready/played
 *    matches.
 *  - Drop byes (auto-completed) and skipped matches entirely.
 *  - Exhibition matches are always kept (admin-managed, filled in by hand).
 *  - Append newly-ready matches, then the upcoming/TBD matches, to whichever
 *    ring frees up earliest (empty rings start "now").
 *
 * Idempotent: rolling an already-rolled schedule leaves it unchanged.
 */
export function rollSchedule(
  schedule: MatchSchedule,
  matches: BracketMatch[],
  division: string,
  /** Ignore existing placements and re-spread every match across the ring count
   *  (used when the ring count changes, so adding/removing a ring rebalances). */
  redistribute = false,
): MatchSchedule {
  const dur = slotDuration(schedule);
  const byId = new Map(matches.map(m => [m.id, m]));

  function schedulable(id: string): boolean {
    const m = byId.get(id);
    if (!m || m.division !== division) return false;
    if (m.status === 'skipped') return false;
    if (m.side === 'exhibition') return false;                // exhibition matches live in their own rings, not bracket rings
    if (isByeMatch(m)) return false;                          // auto-completed bye, never played
    return !!m.slotA.teamName && !!m.slotB.teamName;          // both teams known = ready (completed real matches too)
  }

  const ringCount = Math.max(1, schedule.concurrentRings);

  // 1. Start empty when redistributing (re-spread everything); otherwise keep
  //    still-schedulable placements (preserves order/time/manual reorder).
  const rings: RingMatch[][] = redistribute
    ? Array.from({ length: ringCount }, () => [])
    : Array.from({ length: ringCount }, (_, ri) =>
        (schedule.rings[ri] ?? []).filter(e => schedulable(e.matchId)));

  // 2. Schedulable matches for this division not yet placed = newly ready.
  const placed = new Set(rings.flat().map(e => e.matchId));
  const order = defaultScheduleOrder(matches, division);
  const orderIndex = new Map(order.map((id, i) => [id, i] as const));
  const newlyReady = matches
    .filter(m => m.division === division && !placed.has(m.id) && schedulable(m.id))
    .map(m => m.id)
    .sort((a, b) => (orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER));

  // 3. Append newly-ready, then still-upcoming (empty/TBD) matches — load-
  //    balanced by ring length. Upcoming matches are shown for their schedule
  //    slot but, since their teams aren't known, applyScheduleStatus never
  //    makes them active/next (they stay "to-do").
  function appendToShortestRing(id: string) {
    let best = 0;
    for (let ri = 1; ri < ringCount; ri++) if (rings[ri].length < rings[best].length) best = ri;
    rings[best].push({ matchId: id, startMinute: 0 });
  }
  for (const id of newlyReady) appendToShortestRing(id);
  const placedNow = new Set(rings.flat().map(e => e.matchId));
  for (const upId of order.filter(id => !placedNow.has(id))) appendToShortestRing(upId);

  // 4. Re-time by position: ring slot k gets base + k*dur. This keeps the whole
  //    schedule contiguous (consecutive matches exactly one slot apart, no gaps
  //    that grow as results come in) and parallel across rings — and makes the
  //    result deterministic + idempotent regardless of prior times. `base`
  //    preserves a manually-set start time (the earliest slot in the schedule).
  const existingStarts = schedule.rings.flat().map(e => e.startMinute);
  const base = existingStarts.length ? Math.min(...existingStarts) : START_MINUTE;
  const retimed = rings.map(ring => ring.map((e, k) => ({ ...e, startMinute: base + k * dur })));

  return { ...schedule, rings: retimed };
}

/**
 * Insert a match at the front of a ring's PENDING section — right before its
 * current active (first non-completed) match. The new match takes the old
 * active match's time slot; the old active match and everything after it shift
 * down one slot (so the old active becomes "next"). Completed matches at the
 * front keep their frozen times.
 */
export function prependMatchToRing(
  schedule: MatchSchedule,
  matches: BracketMatch[],
  ringIndex: number,
  matchId: string,
): MatchSchedule {
  const dur = slotDuration(schedule);
  const rings = schedule.rings.map((ring, ri) => {
    if (ri !== ringIndex) return ring;
    const firstPending = ring.findIndex(e => !isCompleted(matches, e.matchId));
    const insertAt = firstPending === -1 ? ring.length : firstPending;
    const startMinute = ring[insertAt]?.startMinute
      ?? (ring[insertAt - 1] ? ring[insertAt - 1].startMinute + dur : START_MINUTE);
    const before = ring.slice(0, insertAt);
    const after  = ring.slice(insertAt).map(e => ({ ...e, startMinute: e.startMinute + dur }));
    return [...before, { matchId, startMinute }, ...after];
  });
  return { ...schedule, rings };
}

// ── exhibition rings ─────────────────────────────────────────────────────────
// Dedicated rings for ad-hoc matches — a single shared schedule (see
// ExhibitionSchedule), entirely separate from the bracket rings and not
// divided by division.

/** Add a new, empty exhibition ring (a dedicated column for ad-hoc matches). */
export function addExhibitionRing(schedule: ExhibitionSchedule): ExhibitionSchedule {
  return { ...schedule, rings: [...schedule.rings, []] };
}

/** Remove an exhibition ring by index (its matches should be deleted by the caller). */
export function removeExhibitionRing(schedule: ExhibitionSchedule, index: number): ExhibitionSchedule {
  return { ...schedule, rings: schedule.rings.filter((_, i) => i !== index) };
}

/** Append a match id to an exhibition ring's queue (time is normalised by rollExhibitionSchedule). */
export function addMatchToExhibitionRing(schedule: ExhibitionSchedule, index: number, matchId: string): ExhibitionSchedule {
  const rings = schedule.rings.map((ring, i) =>
    i === index ? [...ring, { matchId, startMinute: START_MINUTE }] : ring,
  );
  return { ...schedule, rings };
}

/**
 * Change the exhibition schedule's match length and/or gap. Same rules as
 * changeTimings (completed matches keep their exact time), just without a
 * concurrentRings field to carry through — exhibition ring count is managed
 * directly via addExhibitionRing/removeExhibitionRing, not a fixed count.
 */
export function changeExhibitionTimings(
  schedule: ExhibitionSchedule,
  matches: BracketMatch[],
  matchMinutes: number,
  gapMinutes: number,
): ExhibitionSchedule {
  const dur = matchMinutes + gapMinutes;
  const rings = schedule.rings.map(ring => {
    let cursor: number | null = null;
    return ring.map(entry => {
      if (isCompleted(matches, entry.matchId)) {
        cursor = entry.startMinute + dur;
        return entry; // frozen
      }
      const startMinute = cursor ?? entry.startMinute;
      cursor = startMinute + dur;
      return { ...entry, startMinute };
    });
  });
  return { rings, matchMinutes, gapMinutes };
}

/**
 * Rolling pass for the shared exhibition schedule: drops matches that were
 * deleted or skipped, keeps the rest (including blank ones being set up), and
 * re-times them by position by the same base+k*dur rule as rollSchedule.
 * Empty rings are kept so you can still add to them. Never division-scoped —
 * side === 'exhibition' is the only qualifying check.
 */
export function rollExhibitionSchedule(schedule: ExhibitionSchedule, matches: BracketMatch[]): ExhibitionSchedule {
  const dur = slotDuration(schedule);
  const byId = new Map(matches.map(m => [m.id, m]));

  const existingStarts = schedule.rings.flat().map(e => e.startMinute);
  const base = existingStarts.length ? Math.min(...existingStarts) : START_MINUTE;

  const rings = schedule.rings.map(ring =>
    ring
      .filter(e => {
        const m = byId.get(e.matchId);
        return m && m.side === 'exhibition' && m.status !== 'skipped';
      })
      .map((e, k) => ({ ...e, startMinute: base + k * dur })),
  );

  return { ...schedule, rings };
}

/**
 * Returns match IDs in tournament day order:
 *
 * Alternates WB and LB by round index (WB1, LB1, WB2, LB2, …) until WB
 * rounds are exhausted, then plays out the remaining LB rounds, then Finals
 * Day (semis, then the 3rd-place match, then the final). This satisfies all
 * dependency constraints (each round's teams are known before the round starts).
 *
 * WB Round 1 uses middle-first ordering so the top seeds (at positions 1
 * and N) play their first match last — e.g. 8 matches → [4,5,3,6,2,7,1,8].
 * All other rounds use natural match order (M1 → MN).
 */
/**
 * A match auto-completed as a bye — one slot has a team, the other is empty,
 * and it's marked completed (the present team advanced without playing). These
 * never actually happen on a ring, so they're skipped in the schedule.
 */
export function isByeMatch(m: { status?: string; slotA?: { teamName?: string }; slotB?: { teamName?: string } }): boolean {
  const aEmpty = !m.slotA?.teamName;
  const bEmpty = !m.slotB?.teamName;
  return m.status === 'completed' && aEmpty !== bEmpty;
}

export function defaultScheduleOrder(
  matches: Array<{ id: string; division: string; side: string; round: number; matchNumber: number; status?: string; slotA?: { teamName?: string }; slotB?: { teamName?: string } }>,
  division: string,
): string[] {
  // Skip bye matches (auto-completed, never played) so they don't clutter the
  // schedule / match list.
  const div = matches.filter(m => m.division === division && !isByeMatch(m));

  // Expand from the center pair outward.  For N=8 → [4,5,3,6,2,7,1,8].
  function middleFirst(n: number): number[] {
    const out: number[] = [];
    let lo = Math.floor(n / 2);
    let hi = Math.floor(n / 2) + 1;
    while (lo >= 1) {
      out.push(lo--);
      if (hi <= n) out.push(hi++);
    }
    return out;
  }

  function roundIds(side: string, round: number): string[] {
    const ms = div
      .filter(m => m.side === side && m.round === round)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    if (side === 'winners' && round === 1 && ms.length > 2) {
      return middleFirst(ms.length).map(mn => ms[mn - 1]?.id ?? '').filter(Boolean);
    }
    return ms.map(m => m.id);
  }

  const W = div.filter(m => m.side === 'winners').reduce((mx, m) => Math.max(mx, m.round), 0);
  const L = div.filter(m => m.side === 'losers' ).reduce((mx, m) => Math.max(mx, m.round), 0);

  const ids: string[] = [];
  for (let k = 1; k <= Math.max(W, L); k++) {
    if (k <= W) ids.push(...roundIds('winners', k));
    if (k <= L) ids.push(...roundIds('losers',  k));
  }
  ids.push(
    ...div.filter(m => m.side === 'finals-semi').sort((a, b) => a.matchNumber - b.matchNumber).map(m => m.id),
    ...div.filter(m => m.side === 'finals-third').map(m => m.id),
    ...div.filter(m => m.side === 'finals-final').map(m => m.id),
  );

  return ids;
}
