import { type BracketMatch } from "@/lib/mock-data";

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

/** Swap two matches wherever they are — their time slots swap, match IDs trade places. */
export function swapMatchIds(schedule: MatchSchedule, idA: string, idB: string): MatchSchedule {
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

/** Edit one match's time and cascade forward through the rest of its own ring only. */
export function editMatchTime(schedule: MatchSchedule, matchId: string, newMinute: number): MatchSchedule {
  const dur = slotDuration(schedule);
  const rings = schedule.rings.map(ring => {
    const idx = ring.findIndex(e => e.matchId === matchId);
    if (idx === -1) return ring;
    return ring.map((e, i) => i < idx ? e : { ...e, startMinute: newMinute + (i - idx) * dur });
  });
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
export function defaultScheduleOrder(
  matches: Array<{ id: string; division: string; side: string; round: number; matchNumber: number }>,
  division: string,
): string[] {
  const div = matches.filter(m => m.division === division);

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
