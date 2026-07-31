import { type BracketMatch, type Division, type MatchStatus, isFinalsMatch } from "@/lib/mock-data";
import { type AutoFillMode } from "@/lib/seeds";

// Widened from 4 to 6 for the live-streamed format — one OBS scene per ring
// (see /control and /overlay/*), with up to six rings running concurrently.
export type ConcurrentRings = 1 | 2 | 3 | 4 | 5 | 6;

/** Highest ring count the admin UI and OBS companion expose. */
export const MAX_RINGS = 6;

export const DEFAULT_MATCH_MINUTES = 5;
export const DEFAULT_GAP_MINUTES   = 5;
export const START_MINUTE          = 13 * 60; // 1:00 PM = 780

/** One match's place in a ring's own timeline. */
export type RingMatch = {
  matchId: string;
  startMinute: number;
  /**
   * This slot's time was set by hand (editMatchTime, from a TimeCell) rather
   * than derived from its position in the ring. Every roll re-times the whole
   * queue by position (see rollSchedule step 4) and a roll runs on every READ
   * as well as every match edit — so without this flag a hand-set time only
   * survived until the next page load. A pinned slot keeps its own time and
   * anchors the slots after it.
   *
   * It belongs to the SLOT, not the match: swapMatchIds trades match ids
   * between slots and leaves times (and pins) where they are, so "the third
   * match on ring 2 starts at 3:00" survives a swap, which is what the drag
   * gesture means.
   */
  pinned?: boolean;
};

/** Anything with ring queues and a slot duration — MatchSchedule or ExhibitionSchedule. */
type RingSchedule = { rings: RingMatch[][]; matchMinutes: number; gapMinutes: number };

/**
 * Each ring runs its own independent queue of matches. Rings are NOT
 * synchronized to shared rows — this lets a completed match's time stay
 * frozen (see changeTimings) and lets a newly added ring start from "now"
 * instead of the top (see retimeRings), both per-ring rather than global.
 */
export type MatchSchedule = {
  rings: RingMatch[][];   // rings[ringIndex] = that ring's ordered queue
  concurrentRings: ConcurrentRings;
  matchMinutes: number;
  gapMinutes: number;
  /**
   * The Round 1 layout the last Auto Fill used, remembered so the play order it
   * implies survives anything that rebuilds the order from scratch — a ring
   * change (rollSchedule with redistribute), a fresh page load, or a server-side
   * roll. Without it, defaultScheduleOrder would fall back to its middle-first
   * WB R1 ordering and silently undo a Worst-plays-First fill. Absent on rows
   * written before this existed, which reads as 'worst-plays-best' — the
   * behaviour those rows already had.
   */
  autoFillMode?: AutoFillMode;
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
 * Finals Day: a SINGLE ring shared by both divisions, holding each division's
 * two semis, bronze-medal match and grand final — the last eight matches of the
 * event, run one after another on one ring as their own day.
 *
 * Stored (like ExhibitionSchedule) as one shared copy rather than per division,
 * because a ring that interleaves Standards and Open matches can't belong to
 * either division's MatchSchedule. `rings` keeps the array-of-rings shape purely
 * so it can reuse retimeRings; it always holds exactly one ring.
 *
 * Its CONTENTS are fixed — the eight matches are whatever the two brackets'
 * finals are — but the ORDER is only seeded from the event format (see
 * finalsRunningOrder) and can be reordered by hand from there, exactly like the
 * bracket rings. Start times are editable and pin as usual.
 */
export type FinalsSchedule = {
  rings: RingMatch[][];
  matchMinutes: number;
  gapMinutes: number;
};

/**
 * The Finals Day running order, in the order the matches are played:
 *
 *   1. Standards Semi 1      5. Standards Bronze Medal
 *   2. Standards Semi 2      6. Open Bronze Medal
 *   3. Open Semi 1           7. Standards Final
 *   4. Open Semi 2           8. Open Final
 *
 * Both divisions' semis run first so the two bronze/final pairs can follow with
 * their teams already decided. This is the DEFAULT order — the same role
 * defaultScheduleOrder plays for the bracket rings: it seeds a new ring and
 * supplies matches that aren't on it yet, and a hand-reordered ring overrides it
 * (see rollFinalsSchedule).
 */
const FINALS_RUNNING_ORDER: { division: Division; side: BracketMatch['side']; matchNumber: number }[] = [
  { division: 'standards', side: 'finals-semi',  matchNumber: 1 },
  { division: 'standards', side: 'finals-semi',  matchNumber: 2 },
  { division: 'open',      side: 'finals-semi',  matchNumber: 1 },
  { division: 'open',      side: 'finals-semi',  matchNumber: 2 },
  { division: 'standards', side: 'finals-third', matchNumber: 1 },
  { division: 'open',      side: 'finals-third', matchNumber: 1 },
  { division: 'standards', side: 'finals-final', matchNumber: 1 },
  { division: 'open',      side: 'finals-final', matchNumber: 1 },
];

/** Match ids for FINALS_RUNNING_ORDER, skipping any slot the bracket doesn't have. */
export function finalsRunningOrder(matches: BracketMatch[]): string[] {
  return FINALS_RUNNING_ORDER
    .map(slot => matches.find(m =>
      m.division === slot.division && m.side === slot.side && m.matchNumber === slot.matchNumber)?.id)
    .filter((id): id is string => !!id);
}

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
    // Wildcard boxes are exempt for the same reason as exhibition matches:
    // they never occupy a ring (schedulable() also rejects them — slot B is
    // always empty), so ring position must not drive their status.
    //
    // Finals matches are exempt too: they live on the shared Finals Day ring
    // (see FinalsSchedule), not in either division's rings, so their
    // active/next comes from applyFinalsScheduleStatus instead. Without this
    // they'd be force-reset to 'todo' here simply for being absent from these
    // rings — undoing whatever the finals ring just derived.
    if (m.division !== division || m.side === 'exhibition' || m.side === 'wildcard' || isFinalsMatch(m)) return m;
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

/**
 * The Finals Day counterpart of applyScheduleStatus: the same
 * first/second-ready-pending rule, applied to the one shared finals ring. At
 * most one finals match is active and one is next across BOTH divisions, since
 * they all run on the same physical ring.
 *
 * Only finals matches are touched; everything else is returned untouched so
 * this can be composed with the per-division passes in any order.
 */
export function applyFinalsScheduleStatus(
  matches: BracketMatch[],
  schedule: FinalsSchedule,
): BracketMatch[] {
  const byId = new Map(matches.map(m => [m.id, m]));

  const readyPending = schedule.rings.flat()
    .map(e => e.matchId)
    .filter(id => {
      const m = byId.get(id);
      // Same readiness rule as applyScheduleStatus — a finals match whose
      // semi-finalists aren't decided yet holds its slot but stays 'todo'.
      return m && m.status !== 'completed' && m.status !== 'skipped'
        && !!m.slotA.teamName && !!m.slotB.teamName;
    });
  const activeId = readyPending[0];
  const nextId   = readyPending[1];

  return matches.map(m => {
    if (!isFinalsMatch(m)) return m;
    if (m.status === 'completed' || m.status === 'skipped') return m;

    const newStatus: MatchStatus =
      m.id === activeId ? 'active' :
      m.id === nextId   ? 'next'   :
      'todo';

    // Same rule as applyScheduleStatus: becoming active always starts with
    // voting closed, so the admin opens it deliberately.
    if (newStatus === 'active' && m.status !== 'active') {
      return { ...m, status: 'active', votingOpen: false };
    }
    return m.status === newStatus ? m : { ...m, status: newStatus };
  });
}

/**
 * Per-ring live view: which match is currently ON each ring and which is up
 * next — the same first/second-ready-pending rule as applyScheduleStatus (and
 * kept next to it so the two can't drift), but returned BY RING rather than
 * folded into match statuses. The OBS overlays need the ring→match direction:
 * a "Now Battling" lower-third sits on one ring's camera scene and must ask
 * "what's on ring 3?", which the flat status list can't answer (ring position
 * lives only here in the schedule).
 */
export function ringLiveView(
  matches: BracketMatch[],
  schedule: MatchSchedule,
): { active: BracketMatch | null; next: BracketMatch | null }[] {
  const byId = new Map(matches.map(m => [m.id, m]));
  return schedule.rings.map(ring => {
    const readyPending = ring
      .map(e => byId.get(e.matchId))
      .filter((m): m is BracketMatch =>
        !!m && m.status !== 'completed' && m.status !== 'skipped'
          && !!m.slotA.teamName && !!m.slotB.teamName);
    return { active: readyPending[0] ?? null, next: readyPending[1] ?? null };
  });
}

/**
 * Global play-order for a division's schedule: every scheduled match numbered
 * 1..N by start time (ties — concurrent matches on different rings — broken by
 * ring index, then queue position), so each bracket card can show where it sits
 * in the running order. Matches not in the schedule (feeders undecided) aren't
 * in the map, exactly like the per-match start-time lookup.
 */
export function scheduleOrder(schedule: MatchSchedule): Map<string, number> {
  const entries: { matchId: string; startMinute: number; ring: number; pos: number }[] = [];
  schedule.rings.forEach((ring, ringIdx) => {
    ring.forEach((e, pos) => entries.push({ matchId: e.matchId, startMinute: e.startMinute, ring: ringIdx, pos }));
  });
  entries.sort((a, b) =>
    a.startMinute - b.startMinute || a.ring - b.ring || a.pos - b.pos,
  );
  const out = new Map<string, number>();
  entries.forEach((e, i) => { if (!out.has(e.matchId)) out.set(e.matchId, i + 1); });
  return out;
}

/**
 * Match IDs whose team is within `leadMatches` of playing, per ring — i.e. at
 * position 0 (active), 1 (next), … leadMatches in their ring's ready-pending
 * queue. Used to text captains ahead of time so they're at the arena before
 * they're up. Only ready matches (both teams known, not completed/skipped)
 * count toward a position — same readiness rule as applyScheduleStatus.
 */
export function dueForNotify(
  matches: BracketMatch[],
  schedule: MatchSchedule,
  leadMatches: number,
): string[] {
  const byId = new Map(matches.map(m => [m.id, m]));
  const due: string[] = [];
  for (const ring of schedule.rings) {
    const readyPending = ring
      .map(e => e.matchId)
      .filter(id => {
        const m = byId.get(id);
        return m && m.status !== 'completed' && m.status !== 'skipped'
          && !!m.slotA.teamName && !!m.slotB.teamName;
      });
    for (let i = 0; i < readyPending.length && i <= leadMatches; i++) {
      due.push(readyPending[i]);
    }
  }
  return due;
}

export function formatTime(minute: number): string {
  // Wrap into a 24-hour day. A long queue on few rings — or a start time set
  // late in the evening — pushes slots past midnight, and an unwrapped hour
  // just keeps counting: 1500 (25:00) rendered as "13:00 PM" and 1440
  // (midnight) as "12:00 PM" instead of "12:00 AM".
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * When the day is expected to end: the latest slot still TO BE PLAYED across
 * every ring handed in — bracket rings per division, the shared exhibition
 * rings and the Finals Day ring — plus one match length.
 *
 * Two things it deliberately does not do:
 *
 *  - It doesn't read each ring's LAST entry. A ring's queue is ordered by play
 *    position, not by clock time: retimeRings freezes a completed match at the
 *    time it actually played while the pending queue reflows around it, so
 *    marking a match Done out of queue order — routine at a live event — leaves
 *    an already-played slot sitting last, and the estimate jumps BACKWARDS.
 *  - It ignores completed (and skipped) slots entirely. What has already been
 *    played can't be when the day ENDS, and a match frozen at a hand-set or
 *    placeholder time would otherwise drag the whole estimate to it.
 *
 * Falls back to the latest slot of any kind once nothing is left to play, so a
 * finished event reports when it actually wrapped instead of blanking out.
 * Null only when there are no slots at all.
 *
 * Shared by the admin KPI bar and the OBS KPI overlay so the two can't drift —
 * they previously computed this two different ways and disagreed.
 */
export function estimatedFinishMinute(
  schedules: Array<{ rings: RingMatch[][]; matchMinutes: number }>,
  matches: Array<{ id: string; status: MatchStatus }>,
): number | null {
  const statusById = new Map(matches.map(m => [m.id, m.status]));
  const max = (a: number | null, b: number) => (a === null ? b : Math.max(a, b));

  let pendingEnd: number | null = null;
  let anyEnd: number | null = null;
  for (const schedule of schedules) {
    for (const ring of schedule.rings) {
      for (const entry of ring) {
        const end = entry.startMinute + schedule.matchMinutes;
        anyEnd = max(anyEnd, end);
        const status = statusById.get(entry.matchId);
        if (status === 'completed' || status === 'skipped') continue;
        pendingEnd = max(pendingEnd, end);
      }
    }
  }
  return pendingEnd ?? anyEnd;
}

/**
 * Renders an estimated finish. Past midnight the bare clock time reads as
 * EARLIER than the event's start ("12:30 AM" against a 1:00 PM start), so the
 * day rollover is marked.
 */
export function formatFinishTime(minute: number): string {
  return formatTime(minute) + (minute >= 24 * 60 ? ' +1d' : '');
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

  // What's typed is a time OF DAY, but a schedule counts minutes from the start
  // of day 0 and keeps counting past 1440 once the event crosses midnight (see
  // formatTime, which wraps for display). Resolve the typed time to whichever
  // occurrence of it sits CLOSEST to the slot's current time, so editing an
  // 11:00 PM slot to "12am" moves it forward 60 minutes to the coming midnight
  // rather than back 23 hours to 00:00 — the latter being the schedule's new
  // earliest slot, which used to drag the entire layout with it (retimeRings
  // anchors `base` on the minimum start).
  //
  // Nearest-occurrence, rather than always-forward, keeps ordinary backward
  // edits working: a 3:00 PM slot set to "2pm" still moves an hour earlier, and
  // re-committing an unchanged time is a no-op on either side of midnight.
  // A 12-hour tie resolves to the same day, so no edit jumps a day on a coin flip.
  const DAY = 24 * 60;
  const timeOfDay = h * 60 + min;
  let best = timeOfDay + Math.floor(fallback / DAY) * DAY;
  for (const candidate of [best - DAY, best + DAY]) {
    if (candidate >= 0 && Math.abs(candidate - fallback) < Math.abs(best - fallback)) best = candidate;
  }
  return best;
}

function slotDuration(s: Pick<MatchSchedule, 'matchMinutes' | 'gapMinutes'>): number {
  return s.matchMinutes + s.gapMinutes;
}

function isCompleted(matches: BracketMatch[], matchId: string): boolean {
  return matches.find(m => m.id === matchId)?.status === 'completed';
}

/**
 * The single layout rule, applied by every roll and every timing change so the
 * editor and a read-time roll can never disagree. Per ring:
 *
 *  - Completed matches are FROZEN at the time they actually played. Which ring
 *    a match ran on and when is a record of what happened, not a layout choice.
 *  - The pending queue then runs contiguously (one slot per match, no gaps that
 *    grow as results come in) from the moment that ring is free: right after
 *    its last completed match, or from `now` if it hasn't finished anything.
 *  - A pinned slot (see RingMatch.pinned) overrides both, keeping its hand-set
 *    time and re-anchoring everything after it.
 *
 * `now` is the soonest any ring is next free — i.e. when the current active
 * matches are playing. Anchoring on it is what lets a ring added mid-event join
 * the others at the time they're playing instead of being sent back to the top
 * of the day. With nothing completed yet it falls back to `base`, the earliest
 * slot in the schedule, so a fresh schedule lays out exactly as before.
 */
function retimeRings(
  rings: RingMatch[][],
  matches: BracketMatch[],
  base: number,
  dur: number,
  /**
   * Whether this slot's recorded time is a real one. A completed match is only
   * frozen if it HAS a time to be frozen at: rollSchedule appends matches that
   * were never on a ring with a placeholder, and a match completed in the
   * bracket before it ever reached the schedule would otherwise be pinned to
   * midnight and drag the whole layout with it.
   */
  hasRecordedTime: (matchId: string) => boolean = () => true,
): RingMatch[][] {
  const frozen = (e: RingMatch) => isCompleted(matches, e.matchId) && hasRecordedTime(e.matchId);

  const lastPlayed = rings.map(ring =>
    ring.reduce<number | null>(
      (last, e) => (frozen(e) ? Math.max(last ?? e.startMinute, e.startMinute) : last),
      null,
    ),
  );
  const freeAt = lastPlayed.filter((t): t is number => t !== null).map(t => t + dur);
  const now = freeAt.length ? Math.min(...freeAt) : base;

  return rings.map((ring, ri) => {
    const played = lastPlayed[ri];
    let cursor = played === null ? now : played + dur;
    return ring.map(entry => {
      if (frozen(entry)) return entry;   // it already played — that time is a fact
      const startMinute = entry.pinned ? entry.startMinute : cursor;
      cursor = startMinute + dur;
      return entry.startMinute === startMinute ? entry : { ...entry, startMinute };
    });
  });
}

/**
 * The whole-schedule form of retimeRings, anchored on the earliest slot the
 * schedule currently holds (which is how a manually-set overall start time is
 * preserved). Shared by the rollers and by resetMatchTime so the editor and a
 * read-time roll always produce the same layout.
 */
function retimeSchedule<T extends RingSchedule>(schedule: T, matches: BracketMatch[]): T {
  const starts = schedule.rings.flat().map(e => e.startMinute);
  const base = starts.length ? Math.min(...starts) : START_MINUTE;
  return { ...schedule, rings: retimeRings(schedule.rings, matches, base, slotDuration(schedule)) };
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
  autoFillMode: AutoFillMode = 'worst-plays-best',
): MatchSchedule {
  return {
    rings: buildRings(matchIds, rings, startMinute, matchMinutes + gapMinutes),
    concurrentRings: rings,
    matchMinutes,
    gapMinutes,
    autoFillMode,
  };
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
  return { ...retimeSchedule({ ...schedule, matchMinutes, gapMinutes }, matches), matchMinutes, gapMinutes };
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
 *
 * The edited slot is PINNED (see RingMatch.pinned): a hand-set time has to
 * outlive the re-timing that every roll applies, otherwise it lasts only until
 * the next reload. The cascade is just retimeSchedule — the same rule the roll
 * uses — so the editor shows exactly what a reload will, and any other pin in
 * the ring still holds rather than being flattened.
 */
export function editMatchTime<T extends RingSchedule>(
  schedule: T,
  matches: BracketMatch[],
  matchId: string,
  newMinute: number,
): T {
  const rings = schedule.rings.map(ring =>
    ring.map(e => (e.matchId === matchId ? { ...e, startMinute: newMinute, pinned: true } : e)),
  );
  return retimeSchedule({ ...schedule, rings }, matches);
}

/**
 * Drop a hand-set time and let the slot — and everything after it in its ring
 * — fall back to the automatic, position-derived layout. The counterpart to
 * editMatchTime; without it a slot that was edited once could never rejoin the
 * rolling schedule.
 */
export function resetMatchTime<T extends RingSchedule>(schedule: T, matches: BracketMatch[], matchId: string): T {
  if (!schedule.rings.some(ring => ring.some(e => e.matchId === matchId && e.pinned))) return schedule;
  const rings = schedule.rings.map(ring =>
    ring.map(e => (e.matchId === matchId && e.pinned ? { matchId: e.matchId, startMinute: e.startMinute } : e)),
  );
  return retimeSchedule({ ...schedule, rings }, matches);
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
    if (isFinalsMatch(m)) return false;                       // finals play on the shared Finals Day ring (see FinalsSchedule)
    if (isByeMatch(m)) return false;                          // auto-completed bye, never played
    return !!m.slotA.teamName && !!m.slotB.teamName;          // both teams known = ready (completed real matches too)
  }

  const ringCount = Math.max(1, schedule.concurrentRings);

  // 1. Keep still-schedulable placements (preserving order, time, manual
  //    reordering and pinned times). Redistributing re-spreads the PENDING
  //    queue only — completed matches never move, because the ring they ran on
  //    and the time they ran at are a record of what happened. That's also what
  //    makes a newly added ring recognisable as empty, so step 4 can start it
  //    at "now" rather than at the top of the day.
  //
  //    Entries on a ring that no longer exists (the count was lowered) fold
  //    into ring ri % ringCount and the ring is re-sorted by time, so a folded-
  //    in completed match lands in the history rather than after the pending
  //    queue.
  const rings: RingMatch[][] = Array.from({ length: ringCount }, () => []);
  let folded = false;
  schedule.rings.forEach((ring, ri) => {
    for (const e of ring) {
      if (!schedulable(e.matchId)) continue;
      if (redistribute && !isCompleted(matches, e.matchId)) continue;
      if (ri >= ringCount) folded = true;
      rings[ri % ringCount].push(e);
    }
  });
  if (folded) {
    for (const ring of rings) ring.sort((a, b) => a.startMinute - b.startMinute);
  }

  // 2. Schedulable matches for this division not yet placed = newly ready.
  const placed = new Set(rings.flat().map(e => e.matchId));
  const order = defaultScheduleOrder(matches, division, schedule.autoFillMode);
  const orderIndex = new Map(order.map((id, i) => [id, i] as const));
  const newlyReady = matches
    .filter(m => m.division === division && !placed.has(m.id) && schedulable(m.id))
    .map(m => m.id)
    .sort((a, b) => (orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER));

  // 3. Append newly-ready, then still-upcoming (empty/TBD) matches — load-
  //    balanced by how much each ring has left TO PLAY, not by total queue
  //    length: a ring that has already run six matches is free now, and
  //    counting its history against it would starve it of the next ones (and
  //    would hand a freshly added ring every remaining match). Upcoming
  //    matches are shown for their schedule slot but, since their teams aren't
  //    known, applyScheduleStatus never makes them active/next (they stay
  //    "to-do").
  const pendingCount = rings.map(ring => ring.filter(e => !isCompleted(matches, e.matchId)).length);
  function appendToFreestRing(id: string) {
    let best = 0;
    for (let ri = 1; ri < ringCount; ri++) if (pendingCount[ri] < pendingCount[best]) best = ri;
    rings[best].push({ matchId: id, startMinute: 0 });
    pendingCount[best] += 1;
  }
  for (const id of newlyReady) appendToFreestRing(id);
  const placedNow = new Set(rings.flat().map(e => e.matchId));
  for (const upId of order.filter(id => !placedNow.has(id))) appendToFreestRing(upId);

  // 4. Re-time under the one shared layout rule (see retimeRings): completed
  //    matches frozen where they played, each ring's pending queue contiguous
  //    from when that ring is next free, pinned slots holding their hand-set
  //    time. `base` — the earliest slot in the schedule — preserves a manually
  //    set overall start time and is what a not-yet-started schedule lays out
  //    from. This roll runs on every READ, so any rule applied only at edit
  //    time would be undone by the next page load.
  const existingStarts = schedule.rings.flat().map(e => e.startMinute);
  const base = existingStarts.length ? Math.min(...existingStarts) : START_MINUTE;
  const wasScheduled = new Set(schedule.rings.flat().map(e => e.matchId));

  return { ...schedule, rings: retimeRings(rings, matches, base, dur, id => wasScheduled.has(id)) };
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

/**
 * Append a match id to an exhibition ring's queue (time is normalised by
 * rollExhibitionSchedule). The placeholder time is the schedule's existing
 * earliest slot rather than START_MINUTE: the roll takes its `base` from the
 * earliest slot present, so a hardcoded 1:00 PM on a schedule that starts later
 * would drag the whole thing backwards before the roll ever looked at it.
 */
export function addMatchToExhibitionRing(schedule: ExhibitionSchedule, index: number, matchId: string): ExhibitionSchedule {
  const starts = schedule.rings.flat().map(e => e.startMinute);
  const startMinute = starts.length ? Math.min(...starts) : START_MINUTE;
  const rings = schedule.rings.map((ring, i) =>
    i === index ? [...ring, { matchId, startMinute }] : ring,
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
  const { rings } = retimeSchedule({ ...schedule, matchMinutes, gapMinutes }, matches);
  return { rings, matchMinutes, gapMinutes };
}

/**
 * Rolling pass for the shared exhibition schedule: drops matches that were
 * deleted or skipped, keeps the rest (including blank ones being set up), and
 * re-times them under the same shared rule as rollSchedule (see retimeRings) —
 * so a ring added part-way through the event starts alongside whatever the
 * other rings are playing, not back at the top of the day. Empty rings are kept
 * so you can still add to them. Never division-scoped — side === 'exhibition'
 * is the only qualifying check.
 */
export function rollExhibitionSchedule(schedule: ExhibitionSchedule, matches: BracketMatch[]): ExhibitionSchedule {
  const byId = new Map(matches.map(m => [m.id, m]));

  const existingStarts = schedule.rings.flat().map(e => e.startMinute);
  const base = existingStarts.length ? Math.min(...existingStarts) : START_MINUTE;

  const kept = schedule.rings.map(ring =>
    ring.filter(e => {
      const m = byId.get(e.matchId);
      return m && m.side === 'exhibition' && m.status !== 'skipped';
    }),
  );

  return { ...schedule, rings: retimeRings(kept, matches, base, slotDuration(schedule)) };
}

// ── Finals Day ring ──────────────────────────────────────────────────────────

/**
 * Rolling pass for the shared Finals Day ring. Unlike the bracket and exhibition
 * rollers this REBUILDS the queue from finalsRunningOrder every time rather than
 * preserving whatever order is stored: the running order is fixed by the event
 * format, so there's nothing to preserve and no way for it to drift.
 *
 * What IS preserved is each slot's time — including hand-set pins — carried over
 * by match id, so editing a finals start time survives the rebuild. Skipped
 * matches drop out; times then reflow under the same shared rule as every other
 * ring (see retimeRings).
 */
export function rollFinalsSchedule(schedule: FinalsSchedule, matches: BracketMatch[]): FinalsSchedule {
  const skipped = new Set(matches.filter(m => m.status === 'skipped').map(m => m.id));
  const existing = schedule.rings.flat();
  const placed = new Set(existing.map(e => e.matchId));

  const starts = existing.map(e => e.startMinute);
  const base = starts.length ? Math.min(...starts) : START_MINUTE;

  // finalsRunningOrder is the DEFAULT order, not an enforced one: it seeds an
  // empty ring and supplies anything missing, but a stored order always wins.
  // This roll runs on every READ, so rebuilding from the canonical order here
  // would silently undo a hand-reordered ring on the next page load.
  const canonical = finalsRunningOrder(matches);
  const valid = new Set(canonical);

  const kept = existing.filter(e => valid.has(e.matchId) && !skipped.has(e.matchId));
  const appended = canonical
    .filter(id => !placed.has(id) && !skipped.has(id))
    .map(id => ({ matchId: id, startMinute: base }));
  const ring: RingMatch[] = [...kept, ...appended];

  // hasRecordedTime: an appended match has only the `base` placeholder above, so
  // it must not be frozen there just for being completed (same guard
  // rollSchedule uses for freshly appended matches).
  return {
    ...schedule,
    rings: retimeRings([ring], matches, base, slotDuration(schedule), id => placed.has(id)),
  };
}

/**
 * Change the Finals Day ring's match length and/or gap — same rules as
 * changeTimings (completed matches keep their exact time).
 */
export function changeFinalsTimings(
  schedule: FinalsSchedule,
  matches: BracketMatch[],
  matchMinutes: number,
  gapMinutes: number,
): FinalsSchedule {
  const { rings } = retimeSchedule({ ...schedule, matchMinutes, gapMinutes }, matches);
  return { rings, matchMinutes, gapMinutes };
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

/**
 * Whether a match counts towards "matches played / still to play" — the single
 * definition behind the admin KPI bar and both OBS overlays, which each used to
 * carry their own and so reported different totals for the same event.
 *
 * Counted: every bracket game (winners, losers, finals) AND exhibition bouts —
 * an ad-hoc match still occupies a ring and still has to be run.
 *
 * Not counted:
 *  - wildcard boxes, which are holding slots outside the tree, never played;
 *  - skipped matches, which the admin has taken off the day entirely;
 *  - byes, where a team advanced without anyone playing (see isByeMatch).
 */
export function countsTowardTotals(m: {
  side?: string;
  status?: string;
  slotA?: { teamName?: string };
  slotB?: { teamName?: string };
}): boolean {
  if (m.side === 'wildcard') return false;
  if (m.status === 'skipped') return false;
  return !isByeMatch(m);
}

export function defaultScheduleOrder(
  matches: Array<{ id: string; division: string; side: string; round: number; matchNumber: number; status?: string; slotA?: { teamName?: string }; slotB?: { teamName?: string } }>,
  division: string,
  /** How WB Round 1 was laid out — see MatchSchedule.autoFillMode. A
   *  'worst-plays-first' bracket already has its weakest match at the top, so it
   *  wants plain top-to-bottom order; middle-first would fight the layout and
   *  put the seed 1 v 2 match somewhere in the middle of the round. */
  autoFillMode: AutoFillMode = 'worst-plays-best',
): string[] {
  // Matches that will never be played are left out entirely, so they don't
  // clutter the schedule / match list: byes (auto-completed, nobody played
  // them) and anything the admin marked skipped.
  //
  // Skipped has to be filtered HERE, not only in rollSchedule's schedulable().
  // That check drops a skipped match from its ring in step 1, but step 3 then
  // appends everything in this order that isn't currently placed — so a skipped
  // match was dropped and immediately re-added at the BACK of a ring on every
  // single roll. It reappeared on the match list, took a play-order number, and
  // (being the last slot in its ring) became the match every "estimated finish"
  // was computed from.
  const div = matches.filter(m =>
    m.division === division && !isByeMatch(m) && m.status !== 'skipped');

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
    if (side === 'winners' && round === 1 && ms.length > 2 && autoFillMode === 'worst-plays-best') {
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
  // Finals matches are deliberately NOT appended: they play on the shared
  // Finals Day ring in a fixed cross-division order (see finalsRunningOrder),
  // not in this division's bracket rings. Leaving them here would have
  // rollSchedule's "append still-upcoming" step put them straight back.
  return ids;
}
