export type Division = 'standards' | 'open';

export type Team = {
  id: string;
  name: string;
  division: Division;
  points: number;
  score: number | null;
  comment: string;
};

export type MatchStatus = 'todo' | 'next' | 'active' | 'completed' | 'skipped';

export type MatchSlot = { teamName: string; score: number };

export type BracketMatch = {
  id: string;
  division: Division;
  round: number; // 1=R16, 2=QF, 3=SF, 4=Final
  matchNumber: number;
  slotA: MatchSlot;
  slotB: MatchSlot;
  targetScore: number;
  status: MatchStatus;
};

export const ROUND_NAMES: Record<number, string> = {
  1: 'Round of 16',
  2: 'Quarterfinals',
  3: 'Semifinals',
  4: 'Final',
};

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
    score: null,
    comment: '',
  })),
  ...OPEN_NAMES.map((name, i) => ({
    id: `opn-${i + 1}`,
    name,
    division: 'open' as Division,
    points: 950 - i * 60 + (i % 4) * 15,
    score: null,
    comment: '',
  })),
];

function makeBracketMatches(division: Division): BracketMatch[] {
  const config = [
    { round: 1, count: 8 },
    { round: 2, count: 4 },
    { round: 3, count: 2 },
    { round: 4, count: 1 },
  ];
  const matches: BracketMatch[] = [];
  for (const { round, count } of config) {
    for (let m = 1; m <= count; m++) {
      const isFirst = round === 1 && m === 1;
      const isSecond = round === 1 && m === 2;
      matches.push({
        id: `${division}-r${round}-m${m}`,
        division,
        round,
        matchNumber: m,
        slotA: { teamName: '', score: 0 },
        slotB: { teamName: '', score: 0 },
        targetScore: 2,
        status: isFirst ? 'active' : isSecond ? 'next' : 'todo',
      });
    }
  }
  return matches;
}

export const MOCK_BRACKET_MATCHES: BracketMatch[] = [
  ...makeBracketMatches('standards'),
  ...makeBracketMatches('open'),
];
