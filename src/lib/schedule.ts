export type ConcurrentRings = 1 | 2 | 3 | 4;

export const DEFAULT_MATCH_MINUTES = 5;
export const DEFAULT_GAP_MINUTES   = 5;
export const START_MINUTE          = 13 * 60; // 1:00 PM = 780

export type ScheduleSlot = {
  id: string;
  startMinute: number;
  matchIds: string[];  // length ≤ concurrentRings; index 0 = Ring 1
};

export type MatchSchedule = {
  slots: ScheduleSlot[];
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

function buildSlots(
  ids: string[],
  rings: ConcurrentRings,
  startMinute: number,
  slotMin: number,
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  for (let i = 0; i < ids.length; i += rings) {
    const si = i / rings;
    slots.push({
      id: `slot-${si}`,
      startMinute: startMinute + si * slotMin,
      matchIds: ids.slice(i, i + rings),
    });
  }
  return slots;
}

export function generateSchedule(
  matchIds: string[],
  rings: ConcurrentRings = 2,
  startMinute: number = START_MINUTE,
  matchMinutes: number = DEFAULT_MATCH_MINUTES,
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): MatchSchedule {
  return {
    slots: buildSlots(matchIds, rings, startMinute, matchMinutes + gapMinutes),
    concurrentRings: rings,
    matchMinutes,
    gapMinutes,
  };
}

/** Redistribute matches into new ring count; times recalculated from first slot's time. */
export function changeRings(schedule: MatchSchedule, newRings: ConcurrentRings): MatchSchedule {
  const ids   = schedule.slots.flatMap(s => s.matchIds);
  const start = schedule.slots[0]?.startMinute ?? START_MINUTE;
  return {
    slots: buildSlots(ids, newRings, start, slotDuration(schedule)),
    concurrentRings: newRings,
    matchMinutes: schedule.matchMinutes,
    gapMinutes:   schedule.gapMinutes,
  };
}

/** Change match length and/or gap; recalculates all times from first slot's time. */
export function changeTimings(
  schedule: MatchSchedule,
  matchMinutes: number,
  gapMinutes: number,
): MatchSchedule {
  const ids   = schedule.slots.flatMap(s => s.matchIds);
  const start = schedule.slots[0]?.startMinute ?? START_MINUTE;
  return {
    slots: buildSlots(ids, schedule.concurrentRings, start, matchMinutes + gapMinutes),
    concurrentRings: schedule.concurrentRings,
    matchMinutes,
    gapMinutes,
  };
}

/** Swap two matches anywhere in the flat schedule order. */
export function swapMatchIds(schedule: MatchSchedule, idA: string, idB: string): MatchSchedule {
  const ids = schedule.slots.flatMap(s => s.matchIds);
  const iA  = ids.indexOf(idA);
  const iB  = ids.indexOf(idB);
  if (iA === -1 || iB === -1 || iA === iB) return schedule;
  [ids[iA], ids[iB]] = [ids[iB], ids[iA]];
  const start = schedule.slots[0]?.startMinute ?? START_MINUTE;
  return {
    slots: buildSlots(ids, schedule.concurrentRings, start, slotDuration(schedule)),
    concurrentRings: schedule.concurrentRings,
    matchMinutes:    schedule.matchMinutes,
    gapMinutes:      schedule.gapMinutes,
  };
}

/** Edit one slot's time and cascade all subsequent slots. */
export function editSlotTime(schedule: MatchSchedule, slotIdx: number, newMinute: number): MatchSchedule {
  const dur   = slotDuration(schedule);
  const slots = schedule.slots.map((s, i) => {
    if (i < slotIdx) return s;
    return { ...s, startMinute: newMinute + (i - slotIdx) * dur };
  });
  return { ...schedule, slots };
}

/**
 * Returns match IDs in tournament day order:
 *
 * Alternates WB and LB by round index (WB1, LB1, WB2, LB2, …) until WB
 * rounds are exhausted, then plays out the remaining LB rounds, then GF.
 * This satisfies all dependency constraints (each round's teams are known
 * before the round starts).
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
  ids.push(...div.filter(m => m.side === 'grand-final').map(m => m.id));

  return ids;
}
