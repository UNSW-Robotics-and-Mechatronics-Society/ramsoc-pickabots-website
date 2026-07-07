export type Division   = 'standards' | 'open';
export type TeamCount  = 4 | 8 | 16 | 32 | 64;
export type BracketSide = 'winners' | 'losers' | 'finals-semi' | 'finals-final' | 'finals-third';

export type Team = {
  id: string;
  name: string;
  division: Division;
  points: number;
  seed: number | null;
  comment: string;
  present?: boolean;
  wildcard?: boolean;
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
};

// ── round count helpers ────────────────────────────────────────────────────────

export function wbRoundsFor(n: TeamCount): number { return Math.log2(n); }
export function lbRoundsFor(n: TeamCount): number { return 2 * Math.log2(n) - 2; }

function lbMatchCountForRound(lbRound: number, teamCount: TeamCount): number {
  // LB R1,R2: N/4 matches; R3,R4: N/8; R5,R6: N/16 …
  return Math.max(1, (teamCount / 4) / Math.pow(2, Math.floor((lbRound - 1) / 2)));
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

/** Returns where a WB match's LOSER drops into the losers bracket. */
export function wbLossToLBEntry(wbRound: number, wbMatchNum: number): { round: number; match: number; slot: 'a' | 'b' } {
  if (wbRound === 1) {
    return {
      round: 1,
      match: Math.ceil(wbMatchNum / 2),
      slot: wbMatchNum % 2 === 1 ? 'a' : 'b',
    };
  }
  return { round: 2 * (wbRound - 1), match: wbMatchNum, slot: 'b' };
}

/** Returns where a LB match's WINNER advances. Returns null if it's the LB Final (→ GF). */
export function lbWinnerNext(
  lbRound: number,
  lbMatchNum: number,
  totalLbRounds: number,
): { round: number; match: number; slot: 'a' | 'b' } | null {
  if (lbRound === totalLbRounds) return null; // LB Final → GF slot B
  if (lbRound % 2 === 1) {
    // odd round → even (drop-in): same match number, slot A
    return { round: lbRound + 1, match: lbMatchNum, slot: 'a' };
  }
  // even round → odd (consolidation): half the match count
  return {
    round: lbRound + 1,
    match: Math.ceil(lbMatchNum / 2),
    slot: lbMatchNum % 2 === 1 ? 'a' : 'b',
  };
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
  });

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

/** True if `name` is already placed in some other match in this division. */
export function isTeamNameTaken(
  matches: BracketMatch[],
  division: Division,
  excludeMatchId: string,
  name: string,
): boolean {
  return matches.some(m =>
    m.id !== excludeMatchId &&
    m.division === division &&
    (m.slotA.teamName === name || m.slotB.teamName === name),
  );
}

export function applyStatusChange(
  all: BracketMatch[],
  changed: BracketMatch,
  newStatus: MatchStatus,
  teamCount: TeamCount,
): BracketMatch[] {
  const wbRounds = wbRoundsFor(teamCount);
  const lbRounds = lbRoundsFor(teamCount);

  let next = all.map(m => m.id === changed.id ? { ...changed, status: newStatus } : m);

  function setSlot(side: BracketSide, round: number, matchNum: number, slot: 'a' | 'b', name: string) {
    next = next.map(m => {
      if (m.division !== changed.division || m.side !== side || m.round !== round || m.matchNumber !== matchNum) return m;
      return slot === 'a'
        ? { ...m, slotA: { ...m.slotA, teamName: name, score: 0 } }
        : { ...m, slotB: { ...m.slotB, teamName: name, score: 0 } };
    });
  }

  if (newStatus === 'completed') {
    const w = winner({ ...changed, status: 'completed' });
    if (w) {
      const winnerName = w === 'a' ? changed.slotA.teamName : changed.slotB.teamName;
      const loserName  = w === 'a' ? changed.slotB.teamName : changed.slotA.teamName;

      if (changed.side === 'winners') {
        if (changed.round === wbRounds) {
          // WB Final: both participants go straight to Finals Day. The loser
          // does NOT drop into the losers bracket this round — the LB Final
          // stays purely LB-native so Finals Day's 4 teams are all distinct.
          setSlot('finals-semi', 1, 1, 'a', winnerName);
          if (loserName) setSlot('finals-semi', 1, 2, 'a', loserName);
        } else {
          const nr = changed.round + 1;
          const nm = Math.ceil(changed.matchNumber / 2);
          const ns = changed.matchNumber % 2 === 1 ? 'a' : 'b' as 'a' | 'b';
          setSlot('winners', nr, nm, ns, winnerName);
          if (loserName) {
            const lb = wbLossToLBEntry(changed.round, changed.matchNumber);
            setSlot('losers', lb.round, lb.match, lb.slot, loserName);
          }
        }
      } else if (changed.side === 'losers') {
        const adv = lbWinnerNext(changed.round, changed.matchNumber, lbRounds);
        if (adv) {
          setSlot('losers', adv.round, adv.match, adv.slot, winnerName);
        } else {
          // LB Final: winner is LB Champion, loser is LB Runner-up — both
          // feed Finals Day, crossed against the WB Final's two entrants.
          setSlot('finals-semi', 1, 2, 'b', winnerName);
          if (loserName) setSlot('finals-semi', 1, 1, 'b', loserName);
        }
      } else if (changed.side === 'finals-semi') {
        const ns = changed.matchNumber === 1 ? 'a' : 'b' as 'a' | 'b';
        setSlot('finals-final', 1, 1, ns, winnerName);
        // The semi-final loser plays for 3rd place against the other semi's loser.
        if (loserName) setSlot('finals-third', 1, 1, ns, loserName);
      }
    }
  }

  // Promote the next match in bracket order (overridden by applyScheduleStatus, but kept for consistency)
  if (newStatus === 'completed' || newStatus === 'skipped') {
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
