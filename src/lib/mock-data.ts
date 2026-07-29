export type Division   = 'standards' | 'open';
export type TeamCount  = 4 | 8 | 16 | 32 | 64;
// 'exhibition' = an ad-hoc extra match the admin inserts into a ring's schedule
// (e.g. an unplanned/filler match). It is NOT part of the bracket tree, has no
// advancement, and never appears in the winners/losers/finals renderers.
// 'wildcard' is not a played match — it's a holding box outside the bracket
// tree where a knocked-out team waits before being fed into the losers bracket
// at the 8-team stage. Modelled as a match so it persists and edits through the
// same path as everything else; slotB is always unused.
export type BracketSide = 'winners' | 'losers' | 'finals-semi' | 'finals-final' | 'finals-third' | 'exhibition' | 'wildcard';

export type Team = {
  id: string;
  name: string;
  division: Division;
  points: number;
  seed: number | null;
  comment: string;
  present?: boolean;
  // Whether the team is in the bracket (i.e. Auto Fill will place it).
  // Tri-state: undefined/null = "auto" → in-bracket iff it has a seed;
  // true/false = an explicit admin override that sticks regardless of seed.
  inBracket?: boolean | null;
};

export type MatchStatus = 'todo' | 'next' | 'active' | 'completed' | 'skipped';

export type MatchSlot = { teamName: string; score: number };

export type BracketMatch = {
  id: string;
  division: Division;
  side: BracketSide;
  round: number;       // 1-based per side
  matchNumber: number; // 1-based within round
  slotA: MatchSlot;
  slotB: MatchSlot;
  targetScore: number;
  status: MatchStatus;
  // Whether the public may place votes on this match. Only meaningful while the
  // match is active (on the ring); the admin toggles it open manually.
  // Defaults closed — admin must explicitly open voting.
  votingOpen: boolean;
};

// ── round count helpers ────────────────────────────────────────────────────────

export function wbRoundsFor(n: TeamCount): number { return Math.log2(n); }

/** Deep enough for an 8-team stage to exist, and so for wildcards. */
function supportsWildcards(n: TeamCount): boolean { return n >= 16; }

export function lbRoundsFor(n: TeamCount): number {
  // Two adjustments to the textbook 2·log2(n) − 2:
  //
  //  −1  A textbook losers bracket ends with a drop-in round for the WB
  //      Final's loser. Finals Day takes BOTH winners-bracket finalists
  //      directly (see applyStatusChange), so that round would be left with a
  //      single entrant and nobody to play. Dropping it makes the last
  //      consolidation round the LB Final — a real two-team match whose
  //      winner and loser both go up, giving Finals Day 2 from the losers
  //      bracket to match its 2 from the winners bracket.
  //
  //  +1  The wildcard round, inserted at the 8-team stage (wildcardLbRound).
  return 2 * Math.log2(n) - 3 + (supportsWildcards(n) ? 1 : 0);
}

/**
 * The losers-bracket round the two WILDCARD teams feed into.
 *
 * It's the 8-team stage: four unbeaten teams in the winners bracket plus four
 * in the losers bracket. Under the wildcard format only two of those four are
 * bracket qualifiers — the other two places are slot B of this round's two
 * matches, fed from the wildcard boxes outside the tree. So the stage reads
 * 6 teams from the original bracket + 2 wildcards.
 *
 * It is INSERTED directly after the losers round that consolidates four
 * survivors into two, rather than carved out of an existing round. That keeps
 * the tournament true double elimination: nobody loses a seat to make room, so
 * every team still needs two losses to go out — while the two wildcards, who
 * already have two, get a third life. Null below 16 teams, where the bracket
 * is too shallow for the stage to exist at all.
 */
export function wildcardLbRound(teamCount: TeamCount): number | null {
  if (!supportsWildcards(teamCount)) return null;
  // Straight after the losers round that consolidates four survivors into two.
  return 2 * Math.log2(teamCount / 8) + 2;
}

/** How many wildcard boxes a bracket has (one per place at the stage). */
export function wildcardCountFor(teamCount: TeamCount): number {
  return wildcardLbRound(teamCount) === null ? 0 : 2;
}

/** Match count in a textbook losers bracket — R1,R2: N/4; R3,R4: N/8; R5,R6: N/16 … */
function baseLbMatchCount(lbRound: number, teamCount: TeamCount): number {
  return Math.max(1, (teamCount / 4) / Math.pow(2, Math.floor((lbRound - 1) / 2)));
}

/**
 * Rounds before the wildcard round are the textbook bracket untouched; the
 * wildcard round itself is two matches (two LB survivors vs two wildcards);
 * everything after it is the textbook round one place earlier, shifted down by
 * the insertion. Nothing is narrowed, so every team keeps its seat.
 */
function lbMatchCountForRound(lbRound: number, teamCount: TeamCount): number {
  const wc = wildcardLbRound(teamCount);
  if (wc === null) return baseLbMatchCount(lbRound, teamCount);
  if (lbRound === wc) return wildcardCountFor(teamCount);
  return baseLbMatchCount(lbRound > wc ? lbRound - 1 : lbRound, teamCount);
}

// ── round label helpers ────────────────────────────────────────────────────────

export function wbRoundLabel(round: number, total: number): string {
  const rem = total - round;
  if (rem === 0) return 'WB Final';
  if (rem === 1) return 'WB Semis';
  if (rem === 2) return 'WB Quarters';
  return `WB R${round}`;
}

export function lbRoundLabel(round: number, total: number): string {
  if (round === total) return 'LB Final';
  if (round === total - 1) return 'LB Semis';
  return `LB R${round}`;
}

// ── advancement mappings ───────────────────────────────────────────────────────

type LBSeat = { round: number; match: number; slot: 'a' | 'b' };

/**
 * Where a WB match's LOSER drops into the losers bracket. Always a real seat —
 * the wildcard round is inserted, not carved out of an existing round, so no
 * loser is ever turned away. (The WB Final's loser goes to Finals Day instead
 * and never reaches here — see applyStatusChange.)
 */
export function wbLossToLBEntry(wbRound: number, wbMatchNum: number, teamCount: TeamCount): LBSeat {
  const seat: LBSeat = wbRound === 1
    ? { round: 1, match: Math.ceil(wbMatchNum / 2), slot: wbMatchNum % 2 === 1 ? 'a' : 'b' }
    : { round: 2 * (wbRound - 1), match: wbMatchNum, slot: 'b' };
  // Everything at or past the inserted wildcard round moves down one.
  const wc = wildcardLbRound(teamCount);
  if (wc !== null && seat.round >= wc) seat.round += 1;
  return seat;
}

/**
 * Where a LB match's WINNER advances. Null only at the LB Final (→ Finals Day).
 *
 * Rounds are mapped back into the textbook numbering, the ordinary rule is
 * applied, and the target is shifted for the inserted wildcard round. The two
 * feeds touching that round are both one-to-one into slot A: the round before
 * it has already consolidated 4 → 2, and the wildcard round's own slot B holds
 * the brought-back team.
 */
export function lbWinnerNext(lbRound: number, lbMatchNum: number, teamCount: TeamCount): LBSeat | null {
  if (lbRound === lbRoundsFor(teamCount)) return null; // LB Final → Finals Day
  const wc = wildcardLbRound(teamCount);

  if (wc !== null && lbRound === wc) return { round: wc + 1, match: lbMatchNum, slot: 'a' };

  const past = wc !== null && lbRound > wc;
  const o = past ? lbRound - 1 : lbRound; // textbook round number
  const seat: LBSeat = o % 2 === 1
    // odd round → even (drop-in): same match number, slot A
    ? { round: o + 1, match: lbMatchNum, slot: 'a' }
    // even round → odd (consolidation): half the match count
    : { round: o + 1, match: Math.ceil(lbMatchNum / 2), slot: lbMatchNum % 2 === 1 ? 'a' : 'b' };
  return { ...seat, round: past ? seat.round + 1 : seat.round };
}

/**
 * Where wildcard box `n` feeds: slot B of losers-bracket match `n` at the
 * 8-team stage. One box per match, so the two wildcards always land in
 * DIFFERENT matches and each faces a different losers-bracket qualifier —
 * never each other.
 */
export function wildcardTarget(matchNumber: number, teamCount: TeamCount): LBSeat | null {
  const round = wildcardLbRound(teamCount);
  if (round === null || matchNumber > wildcardCountFor(teamCount)) return null;
  return { round, match: matchNumber, slot: 'b' };
}

/** True when this match is a wildcard holding box rather than a played match. */
export function isWildcardBox(m: BracketMatch): boolean {
  return m.side === 'wildcard';
}

/** Light purple — marks everything to do with a wildcard, across every surface. */
export const WILDCARD_PURPLE = '#D8B4FE';

/**
 * Names of every team in a wildcard box, per division. Read from the boxes
 * rather than the losers bracket so the badge appears as soon as a team is
 * placed, and stays with it after it's fed in — the box keeps the name.
 */
export function wildcardTeamNames(matches: BracketMatch[]): Set<string> {
  const names = new Set<string>();
  for (const m of matches) {
    if (m.side === 'wildcard' && m.slotA.teamName) names.add(m.slotA.teamName);
  }
  return names;
}

// ── generator ──────────────────────────────────────────────────────────────────

export function generateDoubleElimBracket(teamCount: TeamCount, division: Division): BracketMatch[] {
  const wbRounds = wbRoundsFor(teamCount);
  const lbRounds = lbRoundsFor(teamCount);
  const matches: BracketMatch[] = [];

  // Winners bracket
  for (let r = 1; r <= wbRounds; r++) {
    const count = teamCount / Math.pow(2, r);
    for (let m = 1; m <= count; m++) {
      matches.push({
        id: `${division}-wb-r${r}-m${m}`,
        division,
        side: 'winners',
        round: r,
        matchNumber: m,
        slotA: { teamName: '', score: 0 },
        slotB: { teamName: '', score: 0 },
        targetScore: 2,
        status: 'todo',
        votingOpen: false,
      });
    }
  }

  // Losers bracket
  for (let r = 1; r <= lbRounds; r++) {
    const count = lbMatchCountForRound(r, teamCount);
    for (let m = 1; m <= count; m++) {
      matches.push({
        id: `${division}-lb-r${r}-m${m}`,
        division,
        side: 'losers',
        round: r,
        matchNumber: m,
        slotA: { teamName: '', score: 0 },
        slotB: { teamName: '', score: 0 },
        targetScore: 2,
        status: 'todo',
        votingOpen: false,
      });
    }
  }

  // Finals Day — crossed semis (WB Champion vs LB Runner-up, WB Runner-up vs
  // LB Champion), winners meet in the True Final.
  for (let m = 1; m <= 2; m++) {
    matches.push({
      id: `${division}-finals-semi-m${m}`,
      division,
      side: 'finals-semi',
      round: 1,
      matchNumber: m,
      slotA: { teamName: '', score: 0 },
      slotB: { teamName: '', score: 0 },
      targetScore: 2,
      status: 'todo',
      votingOpen: false,
    });
  }
  matches.push({
    id: `${division}-finals-final`,
    division,
    side: 'finals-final',
    round: 1,
    matchNumber: 1,
    slotA: { teamName: '', score: 0 },
    slotB: { teamName: '', score: 0 },
    targetScore: 2,
    status: 'todo',
    votingOpen: false,
  });
  // 3rd place: the two semi-final losers play each other.
  matches.push({
    id: `${division}-finals-third`,
    division,
    side: 'finals-third',
    round: 1,
    matchNumber: 1,
    slotA: { teamName: '', score: 0 },
    slotB: { teamName: '', score: 0 },
    targetScore: 2,
    status: 'todo',
    votingOpen: false,
  });

  // Wildcard holding boxes — outside the bracket tree. The admin drops a
  // knocked-out team into slotA; marking the box completed feeds that team
  // into slot B of the matching losers-bracket match at the 8-team stage
  // (see applyStatusChange). targetScore 0 because nothing is played here.
  for (let m = 1; m <= wildcardCountFor(teamCount); m++) {
    matches.push({
      id: `${division}-wildcard-m${m}`,
      division,
      side: 'wildcard',
      round: 1,
      matchNumber: m,
      slotA: { teamName: '', score: 0 },
      slotB: { teamName: '', score: 0 },
      targetScore: 0,
      status: 'todo',
      votingOpen: false,
    });
  }

  // Seed first two WB R1 matches as active / next
  const wbR1 = matches.filter(m => m.side === 'winners' && m.round === 1);
  if (wbR1[0]) wbR1[0].status = 'active';
  if (wbR1[1]) wbR1[1].status = 'next';

  return matches;
}

// ── size transfer ──────────────────────────────────────────────────────────────

/**
 * Transfers existing bracket data to a new bracket size, keeping the top
 * (later-round) matches and discarding early rounds that don't fit.
 */
export function transferBracket(
  oldMatches: BracketMatch[],
  division: Division,
  oldCount: TeamCount,
  newCount: TeamCount,
): BracketMatch[] {
  const newMatches = generateDoubleElimBracket(newCount, division);

  const wbOffset = wbRoundsFor(newCount) - wbRoundsFor(oldCount);
  const lbOffset = lbRoundsFor(newCount) - lbRoundsFor(oldCount);

  for (const old of oldMatches.filter(m => m.division === division)) {
    let newRound = old.round;
    if (old.side === 'winners')     newRound = old.round + wbOffset;
    else if (old.side === 'losers') newRound = old.round + lbOffset;
    // finals-semi / finals-final round is always 1, no offset needed

    if (newRound < 1) continue;

    const target = newMatches.find(
      m => m.side === old.side && m.round === newRound && m.matchNumber === old.matchNumber,
    );
    if (target) {
      target.slotA       = { ...old.slotA };
      target.slotB       = { ...old.slotB };
      target.targetScore = old.targetScore;
      target.status      = old.status;
      target.votingOpen = old.votingOpen;
    }
  }

  return newMatches;
}

// ── match result & advancement logic ─────────────────────────────────────────

export function winner(m: BracketMatch): 'a' | 'b' | null {
  if (m.slotA.score >= m.targetScore && m.slotA.teamName) return 'a';
  if (m.slotB.score >= m.targetScore && m.slotB.teamName) return 'b';
  return null;
}

// A match's position in the tournament's overall sequence — used to pick
// the "most recent" or "next" match out of a team's whole match history,
// since matches don't carry a timestamp. Finals always come after every
// Winners/Losers round; Losers rounds are treated as happening after the
// Winners round of the same number (a team only reaches LB round N once
// it's dropped out of WB).
export function stageRank(m: BracketMatch): number {
  // A wildcard box resolves just before the round it feeds, so it sorts
  // immediately ahead of that losers round.
  if (m.side === 'wildcard') return 4_999;
  if (m.side === 'finals-final') return 10_000;
  if (m.side === 'finals-third') return 9_999;
  if (m.side === 'finals-semi')  return 9_998;
  if (m.side === 'losers') return 5_000 + m.round;
  return m.round;
}

/**
 * Picks the one match to jump/scroll to for a team filter: their live match
 * if they have one right now, else their next scheduled match, else (team
 * is done / eliminated) the last match they actually played.
 */
export function findTeamTargetMatch(pool: BracketMatch[], teamName: string): BracketMatch | null {
  const teamMatches = pool.filter(m => m.slotA.teamName === teamName || m.slotB.teamName === teamName);
  if (!teamMatches.length) return null;
  const active = teamMatches.find(m => m.status === 'active');
  if (active) return active;
  const upcoming = teamMatches.filter(m => m.status === 'todo' || m.status === 'next');
  if (upcoming.length) return upcoming.sort((a, b) => stageRank(a) - stageRank(b))[0];
  const completed = teamMatches.filter(m => m.status === 'completed');
  if (completed.length) return completed.sort((a, b) => stageRank(b) - stageRank(a))[0];
  return teamMatches[0];
}

/**
 * True when the only thing an edit changed is WHO is standing in a slot — a
 * manual team swap (a no-show replaced mid-event, a wrongly drawn team fixed) —
 * as opposed to a score, status, target-score or voting-toggle edit. Scores stay
 * as recorded, so this is a substitution of the occupant and nothing else.
 *
 * Both admin editors route a swap AWAY from applyStatusChange. That function is
 * right for every other edit: it writes advancement when a match completes and
 * retracts it when the winner changes. But its retraction resets an already-
 * played downstream match to 'todo' with both scores zeroed (see clearSlot), so
 * putting a swap through it would cost the day's logged results — the admin
 * fixes one slot and loses the matches that came after it. A swap therefore
 * writes just that slot: nothing else in the tree moves.
 *
 * Which also means duplicates are allowed, deliberately. Swapping two teams is
 * done one slot at a time, so the halfway state always has a team standing in
 * two places, and the uniqueness guard this replaced silently reverted the edit
 * instead of letting the admin finish.
 */
export function isTeamSwapOnly(prev: BracketMatch, next: BracketMatch): boolean {
  return prev.id === next.id
    && prev.status      === next.status
    && prev.targetScore === next.targetScore
    && prev.votingOpen  === next.votingOpen
    && prev.slotA.score === next.slotA.score
    && prev.slotB.score === next.slotB.score
    && (prev.slotA.teamName !== next.slotA.teamName
      || prev.slotB.teamName !== next.slotB.teamName);
}

/** A single slot somewhere in the bracket tree. */
export type AdvancementSeat = { side: BracketSide; round: number; match: number; slot: 'a' | 'b' };
/** "This team goes in that seat." */
export type AdvancementWrite = { seat: AdvancementSeat; name: string };

function sameSeat(a: AdvancementSeat, b: AdvancementSeat): boolean {
  return a.side === b.side && a.round === b.round && a.match === b.match && a.slot === b.slot;
}

/**
 * Every seat a COMPLETED match feeds, with the team that goes there — the
 * winner's onward seat plus, where one exists, the loser's.
 *
 * The single source of truth for advancement, used in both directions:
 * applyStatusChange writes these seats when a match completes, and RETRACTS
 * exactly the same ones when it stops being completed (or when an edit changes
 * who won). Deriving both from one function is what keeps a retraction from
 * drifting out of sync with the write it's undoing.
 *
 * Empty names are omitted, so an incomplete match simply feeds nothing.
 */
export function advancementWrites(m: BracketMatch, teamCount: TeamCount): AdvancementWrite[] {
  const wbRounds = wbRoundsFor(teamCount);
  const out: AdvancementWrite[] = [];
  const push = (seat: AdvancementSeat | null, name: string) => {
    if (seat && name) out.push({ seat, name });
  };

  // A wildcard box isn't played — completing it just sends whoever is sitting
  // in it into the losers bracket, so it's handled before the winner() check
  // (there's no second slot for winner() to decide between).
  if (m.side === 'wildcard') {
    const t = wildcardTarget(m.matchNumber, teamCount);
    push(t && { side: 'losers', round: t.round, match: t.match, slot: t.slot }, m.slotA.teamName);
    return out;
  }

  const w = winner(m);
  if (!w) return out;
  const winnerName = w === 'a' ? m.slotA.teamName : m.slotB.teamName;
  const loserName  = w === 'a' ? m.slotB.teamName : m.slotA.teamName;

  if (m.side === 'winners') {
    if (m.round === wbRounds) {
      // WB Final: both participants go straight to Finals Day. The loser
      // does NOT drop into the losers bracket this round — the LB Final
      // stays purely LB-native so Finals Day's 4 teams are all distinct.
      push({ side: 'finals-semi', round: 1, match: 1, slot: 'a' }, winnerName);
      push({ side: 'finals-semi', round: 1, match: 2, slot: 'a' }, loserName);
    } else {
      push({
        side: 'winners',
        round: m.round + 1,
        match: Math.ceil(m.matchNumber / 2),
        slot: m.matchNumber % 2 === 1 ? 'a' : 'b',
      }, winnerName);
      const lb = wbLossToLBEntry(m.round, m.matchNumber, teamCount);
      push({ side: 'losers', round: lb.round, match: lb.match, slot: lb.slot }, loserName);
    }
  } else if (m.side === 'losers') {
    const adv = lbWinnerNext(m.round, m.matchNumber, teamCount);
    if (adv) {
      push({ side: 'losers', round: adv.round, match: adv.match, slot: adv.slot }, winnerName);
    } else {
      // LB Final: winner is LB Champion, loser is LB Runner-up — both
      // feed Finals Day, crossed against the WB Final's two entrants.
      push({ side: 'finals-semi', round: 1, match: 2, slot: 'b' }, winnerName);
      push({ side: 'finals-semi', round: 1, match: 1, slot: 'b' }, loserName);
    }
  } else if (m.side === 'finals-semi') {
    const slot = m.matchNumber === 1 ? 'a' : 'b';
    push({ side: 'finals-final', round: 1, match: 1, slot }, winnerName);
    // The semi-final loser plays for 3rd place against the other semi's loser.
    push({ side: 'finals-third', round: 1, match: 1, slot }, loserName);
  }

  return out;
}

export function applyStatusChange(
  all: BracketMatch[],
  changed: BracketMatch,
  newStatus: MatchStatus,
  teamCount: TeamCount,
): BracketMatch[] {
  const prev = all.find(m => m.id === changed.id);

  // A match that WAS completed and still is, but no longer has a winner, was
  // just edited below its target score (the classic mis-click: +1 auto-completed
  // it, then -1). It can't stay completed with nobody having won — drop it back
  // to 'todo' and let applyScheduleStatus re-derive active/next from the ring
  // order. Only this case: an admin explicitly picking "completed" on a match
  // with no winner is a deliberate choice (and is left alone).
  const stillCompletedWithoutWinner =
    prev?.status === 'completed' && newStatus === 'completed'
    && changed.side !== 'wildcard' && !winner(changed);
  const status: MatchStatus = stillCompletedWithoutWinner ? 'todo' : newStatus;

  const updated: BracketMatch = { ...changed, status };
  let next = all.map(m => m.id === changed.id ? updated : m);

  function setSlot(seat: AdvancementSeat, name: string) {
    next = next.map(m => {
      if (m.division !== changed.division || m.side !== seat.side
          || m.round !== seat.round || m.matchNumber !== seat.match) return m;
      return seat.slot === 'a'
        ? { ...m, slotA: { ...m.slotA, teamName: name, score: 0 } }
        : { ...m, slotB: { ...m.slotB, teamName: name, score: 0 } };
    });
  }

  /**
   * Undoes one advancement write. Only clears the seat if it still holds the
   * team this match put there — so a name the admin typed by hand, or one a
   * different feeder wrote, is never wiped.
   *
   * A downstream match that was itself COMPLETED is also reset to 'todo' with
   * both scores zeroed: it can't have been played by a team that's no longer in
   * it, and leaving it completed with one empty slot would make isByeMatch()
   * read it as a bye and drop it from the schedule. Its OWN advancement is
   * deliberately left in place (retraction is one level deep) — so re-entering
   * a much earlier result can still leave a stale name further down the tree.
   */
  function clearSlot(seat: AdvancementSeat, name: string) {
    next = next.map(m => {
      if (m.division !== changed.division || m.side !== seat.side
          || m.round !== seat.round || m.matchNumber !== seat.match) return m;
      if ((seat.slot === 'a' ? m.slotA.teamName : m.slotB.teamName) !== name) return m;
      const wasPlayed = m.status === 'completed';
      const cleared = { teamName: '', score: 0 };
      return {
        ...m,
        slotA: seat.slot === 'a' ? cleared : { ...m.slotA, score: wasPlayed ? 0 : m.slotA.score },
        slotB: seat.slot === 'b' ? cleared : { ...m.slotB, score: wasPlayed ? 0 : m.slotB.score },
        status: wasPlayed ? 'todo' : m.status,
      };
    });
  }

  // Retract what this match used to feed, then write what it feeds now. A seat
  // that's about to be rewritten with the SAME team is skipped, so editing an
  // unrelated field on a completed match (target score, voting toggle) doesn't
  // needlessly churn the next round.
  const before = prev?.status === 'completed' ? advancementWrites(prev, teamCount) : [];
  const after  = status === 'completed' ? advancementWrites(updated, teamCount) : [];
  for (const b of before) {
    if (after.some(a => sameSeat(a.seat, b.seat) && a.name === b.name)) continue;
    clearSlot(b.seat, b.name);
  }
  for (const a of after) setSlot(a.seat, a.name);

  // Wildcard boxes sit outside the bracket tree, so there's no "next box" to
  // promote — the original early return, kept.
  if (changed.side === 'wildcard') return next;

  // Promote the next match in bracket order (overridden by applyScheduleStatus, but kept for consistency)
  if (status === 'completed' || status === 'skipped') {
    const sideMates = next
      .filter(m => m.division === changed.division && m.side === changed.side)
      .sort((a, b) => a.round !== b.round ? a.round - b.round : a.matchNumber - b.matchNumber);
    const idx      = sideMates.findIndex(m => m.id === changed.id);
    const promote  = sideMates[idx + 1];
    const upcoming = sideMates[idx + 2];
    next = next.map(m => {
      if (promote  && m.id === promote.id  && (m.status === 'todo' || m.status === 'next')) return { ...m, status: 'active' };
      if (upcoming && m.id === upcoming.id && m.status === 'todo')                          return { ...m, status: 'next' };
      return m;
    });
  }

  return next;
}

/**
 * Auto-completes WB Round 1 byes: any R1 match with exactly one team present
 * (no opponent) is marked completed and that team advances to WB Round 2 —
 * no match is ever played. Byes are then excluded from the schedule / match
 * list (see isByeMatch in lib/schedule) so they never appear as a playable
 * match. A bye has no loser, so nothing drops into the losers bracket. Matches
 * with both slots filled (a real match) or both empty (an unused slot) are left
 * untouched. Returns a new array; the input is not mutated.
 */
export function completeRound1Byes(matches: BracketMatch[], division: Division): BracketMatch[] {
  const next = matches.map(m => ({ ...m, slotA: { ...m.slotA }, slotB: { ...m.slotB } }));

  for (const m of next) {
    if (m.division !== division || m.side !== 'winners' || m.round !== 1) continue;
    const aEmpty = !m.slotA.teamName;
    const bEmpty = !m.slotB.teamName;
    if (aEmpty === bEmpty) continue; // both filled → real match; both empty → unused slot

    const winnerName = aEmpty ? m.slotB.teamName : m.slotA.teamName;
    m.status = 'completed';

    // Advance the bye team into WB Round 2 — the same winner mapping
    // applyStatusChange uses (R1 match M → R2 match ceil(M/2), slot a if M odd).
    const nm = Math.ceil(m.matchNumber / 2);
    const ns: 'a' | 'b' = m.matchNumber % 2 === 1 ? 'a' : 'b';
    const target = next.find(
      x => x.division === division && x.side === 'winners' && x.round === m.round + 1 && x.matchNumber === nm,
    );
    if (target) {
      if (ns === 'a') target.slotA = { teamName: winnerName, score: 0 };
      else            target.slotB = { teamName: winnerName, score: 0 };
    }
  }

  return next;
}

/**
 * Default placeholder text for every empty slot — "Winner of R64 M3", "Loser of
 * WB Final", etc — derived by walking the SAME advancement mappings
 * applyStatusChange uses, but forwards: for each match, where its winner/loser
 * lands. Returns a map from a match's id to its slot-A/slot-B labels. Used as
 * placeholder text so an upcoming match reads as the feeder that will fill it,
 * while the admin can still type a real team name to override.
 */
export function computeSlotDefaults(
  matches: BracketMatch[],
  division: Division,
  teamCount: TeamCount,
): Map<string, { a?: string; b?: string }> {
  const wbRounds = wbRoundsFor(teamCount);
  const lbRounds = lbRoundsFor(teamCount);
  const out = new Map<string, { a?: string; b?: string }>();

  const destId = (side: BracketSide, round: number, match: number) =>
    side === 'winners'      ? `${division}-wb-r${round}-m${match}` :
    side === 'losers'       ? `${division}-lb-r${round}-m${match}` :
    side === 'finals-semi'  ? `${division}-finals-semi-m${match}` :
    side === 'finals-final' ? `${division}-finals-final` :
                              `${division}-finals-third`;

  function setDefault(side: BracketSide, round: number, match: number, slot: 'a' | 'b', label: string) {
    const id = destId(side, round, match);
    const entry = out.get(id) ?? {};
    entry[slot] = label;
    out.set(id, entry);
  }

  function feeder(m: BracketMatch): string {
    if (m.side === 'winners') return m.round === wbRounds ? 'WB Final' : `R${teamCount / 2 ** (m.round - 1)} M${m.matchNumber}`;
    if (m.side === 'losers')  return m.round === lbRounds ? 'LB Final' : `LB R${m.round} M${m.matchNumber}`;
    if (m.side === 'finals-semi') return `Semi ${m.matchNumber}`;
    return '';
  }

  // The wildcard places: the losers-bracket slot reads "Wildcard Team n" until
  // the matching box is sent in, and the box itself reads the same until the
  // admin picks a knocked-out team for it.
  for (let m = 1; m <= wildcardCountFor(teamCount); m++) {
    const target = wildcardTarget(m, teamCount);
    if (target) setDefault('losers', target.round, target.match, target.slot, `Wildcard Team ${m}`);
    const boxId = `${division}-wildcard-m${m}`;
    out.set(boxId, { ...(out.get(boxId) ?? {}), a: `Wildcard Team ${m}` });
  }


  for (const m of matches) {
    if (m.division !== division) continue;
    const w = `Winner of ${feeder(m)}`;
    const l = `Loser of ${feeder(m)}`;

    if (m.side === 'winners') {
      if (m.round === wbRounds) {
        setDefault('finals-semi', 1, 1, 'a', w);
        setDefault('finals-semi', 1, 2, 'a', l);
      } else {
        const ns: 'a' | 'b' = m.matchNumber % 2 === 1 ? 'a' : 'b';
        setDefault('winners', m.round + 1, Math.ceil(m.matchNumber / 2), ns, w);
        const lb = wbLossToLBEntry(m.round, m.matchNumber, teamCount);
        setDefault('losers', lb.round, lb.match, lb.slot, l);
      }
    } else if (m.side === 'losers') {
      if (m.round === lbRounds) {
        setDefault('finals-semi', 1, 2, 'b', w);
        setDefault('finals-semi', 1, 1, 'b', l);
      } else {
        const adv = lbWinnerNext(m.round, m.matchNumber, teamCount);
        if (adv) setDefault('losers', adv.round, adv.match, adv.slot, w);
      }
    } else if (m.side === 'finals-semi') {
      const ns: 'a' | 'b' = m.matchNumber === 1 ? 'a' : 'b';
      setDefault('finals-final', 1, 1, ns, w);
      setDefault('finals-third', 1, 1, ns, l);
    }
  }

  return out;
}

// ── mock teams ─────────────────────────────────────────────────────────────────

const STANDARDS_NAMES = [
  'Iron Fist', 'Steel Storm', 'Crusher MkII', 'Vortex Pro',
  'Titanfall', 'Voltage', 'Quantum', 'Spark Plug',
  'Ironclad', 'Meltdown', 'Gigabyte', 'Riptide',
  'Bullseye', 'Dynamo', 'Overdrive', 'Circuit Breaker',
];

const OPEN_NAMES = [
  'Annihilator', 'Beast Mode', 'Carnage', 'Dreadnaught',
  'Executioner', 'Fury', 'Goliath', 'Havoc',
  'Inferno', 'Juggernaut', 'Kraken', 'Leviathan',
  'Mammoth', 'Nightmare', 'Obliterator', 'Pulverizer',
];

export const MOCK_TEAMS: Team[] = [
  ...STANDARDS_NAMES.map((name, i) => ({
    id: `std-${i + 1}`,
    name,
    division: 'standards' as Division,
    points: 900 - i * 55 + (i % 3) * 20,
    seed: null,
    comment: '',
  })),
  ...OPEN_NAMES.map((name, i) => ({
    id: `opn-${i + 1}`,
    name,
    division: 'open' as Division,
    points: 950 - i * 60 + (i % 4) * 15,
    seed: null,
    comment: '',
  })),
];

export const DEFAULT_TEAM_COUNT: TeamCount = 16;

export const MOCK_BRACKET_MATCHES: BracketMatch[] = [
  ...generateDoubleElimBracket(DEFAULT_TEAM_COUNT, 'standards'),
  ...generateDoubleElimBracket(DEFAULT_TEAM_COUNT, 'open'),
];
