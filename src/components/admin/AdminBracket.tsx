"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BracketMatch, type BracketSide, type Division,
  type MatchStatus, type Team, type TeamCount,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
  wbLossToLBEntry, lbWinnerNext,
} from "@/lib/mock-data";
import { cn } from "@/lib/cn";

// ── layout constants ───────────────────────────────────────────────────────────
const MATCH_H      = 96;
const ROUND_W      = 188;
const CONN_W       = 44;
const GF_W         = 200;
const WINNER_W     = 90;
const SLOT_H       = MATCH_H + 14; // vertical space each match occupies in a column
const SECTION_GAP  = 36;           // pixels between WB and LB strips

function sectionH(r1Matches: number) { return r1Matches * SLOT_H; }

// statuses that auto-complete when score hits target
const AUTO_COMPLETE_FROM: MatchStatus[] = ['todo', 'next', 'active'];

// ── status styling ─────────────────────────────────────────────────────────────
const STATUS_BORDER: Record<MatchStatus, string> = {
  todo:      'border-white/[0.28]',
  next:      'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.45)]',
  active:    'border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.5)]',
  completed: 'border-white/25 opacity-70',
  skipped:   'border-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]',
};
const STATUS_LABEL: Record<MatchStatus, string> = {
  todo: 'To Do', next: 'Next', active: 'Active', completed: 'Done', skipped: 'Skip',
};
const STATUS_TEXT: Record<MatchStatus, string> = {
  todo: 'text-foreground', next: 'text-yellow-400', active: 'text-green-400',
  completed: 'text-white/50', skipped: 'text-red-400',
};

// ── helpers ────────────────────────────────────────────────────────────────────
function winner(m: BracketMatch): 'a' | 'b' | null {
  if (m.slotA.score >= m.targetScore && m.slotA.teamName) return 'a';
  if (m.slotB.score >= m.targetScore && m.slotB.teamName) return 'b';
  return null;
}

// ── advancement logic ──────────────────────────────────────────────────────────
function applyStatusChange(
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
          setSlot('grand-final', 1, 1, 'a', winnerName);
        } else {
          const nr = changed.round + 1;
          const nm = Math.ceil(changed.matchNumber / 2);
          const ns = changed.matchNumber % 2 === 1 ? 'a' : 'b' as 'a' | 'b';
          setSlot('winners', nr, nm, ns, winnerName);
        }
        if (loserName) {
          const lb = wbLossToLBEntry(changed.round, changed.matchNumber);
          setSlot('losers', lb.round, lb.match, lb.slot, loserName);
        }
      } else if (changed.side === 'losers') {
        const adv = lbWinnerNext(changed.round, changed.matchNumber, lbRounds);
        if (adv) {
          setSlot('losers', adv.round, adv.match, adv.slot, winnerName);
        } else {
          setSlot('grand-final', 1, 1, 'b', winnerName);
        }
      }
    }
  }

  // Promote next match in same bracket side to active/next
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

// ── MatchTeamInput — local state fixes the one-letter-at-a-time bug ────────────
// Root cause: SlotRow was an inline component inside MatchCard, so React
// remounted it (and reset focus) on every parent render. Now it's a stable
// named component + input carries its own local value, only committing on blur.
function MatchTeamInput({
  value, datalistId, onCommit,
}: {
  value: string; datalistId: string; onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const committed         = useRef(value);

  // Sync when prop changes externally (winner advancement, clear, auto-fill)
  useEffect(() => {
    if (value !== committed.current) {
      setLocal(value);
      committed.current = value;
    }
  }, [value]);

  function commit(v: string) {
    committed.current = v;
    onCommit(v);
  }

  return (
    <input
      list={datalistId}
      value={local}
      placeholder="Team…"
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== committed.current) commit(local); }}
      onKeyDown={e => { if (e.key === 'Enter') commit(local); }}
      // Drop from TeamList (text/plain carries team name).
      // stopPropagation prevents the event bubbling to MatchCard's match-swap handler.
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('application/match-id')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={e => {
        if (e.dataTransfer.types.includes('application/match-id')) return; // let match-swap handle
        e.preventDefault();
        e.stopPropagation();
        const name = e.dataTransfer.getData('text/plain');
        if (name) commit(name);
      }}
      className="min-w-0 flex-1 bg-transparent text-[0.6rem] outline-none placeholder:text-foreground/20 truncate"
    />
  );
}

// ── SlotRow — defined outside MatchCard so React never remounts it ─────────────
type SlotRowProps = {
  slotData: { teamName: string; score: number };
  won: boolean; lost: boolean;
  datalistId: string;
  onNameCommit: (n: string) => void;
  onScoreDelta: (d: number) => void;
};
function SlotRow({ slotData, won, lost, datalistId, onNameCommit, onScoreDelta }: SlotRowProps) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-0.5 px-1.5",
        won  && "rounded bg-amber-400/20",
        lost && "opacity-40",
      )}
      // Accept team drops anywhere on the row, not just on the input itself.
      // Stop propagation so MatchCard's match-swap handler doesn't also fire.
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('application/match-id')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={e => {
        if (e.dataTransfer.types.includes('application/match-id')) return;
        e.preventDefault();
        e.stopPropagation();
        const name = e.dataTransfer.getData('text/plain');
        if (name) onNameCommit(name);
      }}
    >
      <MatchTeamInput value={slotData.teamName} datalistId={datalistId} onCommit={onNameCommit} />
      {won  && <span className="shrink-0 text-amber-300 text-[0.55rem]">★</span>}
      {lost && <span className="shrink-0 text-red-400/70 text-[0.55rem]">✗</span>}
      <button onClick={() => onScoreDelta(-1)} className="shrink-0 px-0.5 text-[0.65rem] text-foreground/70 hover:text-foreground">−</button>
      <span className="shrink-0 w-3.5 text-center text-[0.65rem] tabular-nums">{slotData.score}</span>
      <button onClick={() => onScoreDelta( 1)} className="shrink-0 px-0.5 text-[0.65rem] text-foreground/70 hover:text-foreground">+</button>
    </div>
  );
}

// ── MatchCard ──────────────────────────────────────────────────────────────────
type MatchCardProps = {
  match: BracketMatch;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onMatchDrop: (targetId: string) => void;
  onDragEnd: () => void;
};
function MatchCard({ match, onChange, datalistId, draggingId, onDragStart, onMatchDrop, onDragEnd }: MatchCardProps) {
  const w = winner(match);
  const swappable       = match.status === 'todo' || match.status === 'next';
  const isBeingDragged  = draggingId === match.id;
  const isMatchDropTgt  = draggingId !== null && draggingId !== match.id && swappable;

  function setScore(slot: 'a' | 'b', delta: number) {
    const updated: BracketMatch = {
      ...match,
      slotA: slot === 'a' ? { ...match.slotA, score: Math.max(0, match.slotA.score + delta) } : match.slotA,
      slotB: slot === 'b' ? { ...match.slotB, score: Math.max(0, match.slotB.score + delta) } : match.slotB,
    };
    if (winner(updated) && AUTO_COMPLETE_FROM.includes(updated.status)) {
      onChange({ ...updated, status: 'completed' });
    } else {
      onChange(updated);
    }
  }

  function setName(slot: 'a' | 'b', name: string) {
    onChange({
      ...match,
      slotA: slot === 'a' ? { ...match.slotA, teamName: name } : match.slotA,
      slotB: slot === 'b' ? { ...match.slotB, teamName: name } : match.slotB,
    });
  }

  const sideLabel = match.side === 'grand-final'
    ? 'Grand Final'
    : `${match.side === 'winners' ? 'W' : 'L'}B R${match.round}·M${match.matchNumber}`;

  return (
    <div
      style={{ height: MATCH_H }}
      draggable={swappable}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/match-id', match.id); // distinguishes from team drags
        onDragStart(match.id);
      }}
      onDragOver={e => { if (isMatchDropTgt) e.preventDefault(); }}
      onDrop={e => {
        if (e.dataTransfer.types.includes('application/match-id')) {
          e.preventDefault();
          onMatchDrop(match.id);
        }
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col rounded-md border bg-[#0d1018] text-foreground transition-opacity",
        STATUS_BORDER[match.status],
        isBeingDragged  && "opacity-30",
        isMatchDropTgt  && "ring-2 ring-white/60 ring-dashed",
        swappable       && "cursor-grab active:cursor-grabbing",
      )}
    >
      <SlotRow
        slotData={match.slotA} won={w === 'a'} lost={w !== null && w !== 'a'}
        datalistId={datalistId} onNameCommit={n => setName('a', n)} onScoreDelta={d => setScore('a', d)}
      />
      <div className="border-t border-white/[0.14]" />
      <SlotRow
        slotData={match.slotB} won={w === 'b'} lost={w !== null && w !== 'b'}
        datalistId={datalistId} onNameCommit={n => setName('b', n)} onScoreDelta={d => setScore('b', d)}
      />

      <div className="flex items-center justify-between border-t border-white/[0.14] px-1.5 py-1.5">
        <span className="w-16 shrink-0 text-[0.5rem] text-foreground/50 truncate">{sideLabel}</span>
        <select
          value={match.status}
          onChange={e => onChange({ ...match, status: e.target.value as MatchStatus })}
          className={cn(
            "cursor-pointer rounded border border-white/30 bg-black/60 px-1 py-0.5 text-[0.6rem] font-medium outline-none",
            STATUS_TEXT[match.status],
          )}
        >
          {(['todo', 'next', 'active', 'completed', 'skipped'] as MatchStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <label className="flex w-10 items-center justify-end gap-0.5 text-[0.5rem] text-foreground/50">
          Win:
          <input
            type="text"
            inputMode="numeric"
            value={match.targetScore}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n) && n >= 1) onChange({ ...match, targetScore: n });
              else if (e.target.value === '') onChange({ ...match, targetScore: 1 });
            }}
            className="w-5 bg-transparent text-center text-foreground outline-none"
          />
        </label>
      </div>
    </div>
  );
}

// ── ConnectorSVG ───────────────────────────────────────────────────────────────
const WON_COLOR  = '#4ade80';
const BASE_COLOR = 'rgba(255,255,255,0.85)';

function ConnectorSVG({ fromMatches, height }: { fromMatches: BracketMatch[]; height: number }) {
  const fromN   = fromMatches.length;
  const pairs   = fromN / 2;
  const spacing = height / fromN;
  const cx      = CONN_W / 2;

  return (
    <svg width={CONN_W} height={height} className="shrink-0 overflow-visible">
      {Array.from({ length: pairs }, (_, i) => {
        const m1       = fromMatches[2 * i];
        const m2       = fromMatches[2 * i + 1];
        const m1Done   = m1?.status === 'completed';
        const m2Done   = m2?.status === 'completed';
        const bothDone = m1Done && m2Done;
        const y1       = spacing * (2 * i + 0.5);
        const y2       = spacing * (2 * i + 1.5);
        const midY     = (y1 + y2) / 2;
        const c = (done: boolean) => done ? WON_COLOR : BASE_COLOR;
        return (
          <g key={i}>
            <line x1={0}    y1={y1}   x2={cx}     y2={y1}   stroke={c(m1Done)}   strokeWidth={1.5} />
            <line x1={cx}   y1={y1}   x2={cx}     y2={y2}   stroke={c(bothDone)} strokeWidth={1.5} />
            <line x1={0}    y1={y2}   x2={cx}     y2={y2}   stroke={c(m2Done)}   strokeWidth={1.5} />
            <line x1={cx}   y1={midY} x2={CONN_W} y2={midY} stroke={c(bothDone)} strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
  );
}

// ── RoundColumn ────────────────────────────────────────────────────────────────
type RoundColumnProps = {
  matches: BracketMatch[];
  height: number;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onMatchDrop: (id: string) => void;
  onDragEnd: () => void;
};
function RoundColumn({ matches, height, onChange, datalistId, draggingId, onDragStart, onMatchDrop, onDragEnd }: RoundColumnProps) {
  return (
    <div style={{ width: ROUND_W, height }} className="flex shrink-0 flex-col justify-around">
      {matches.map(m => (
        <MatchCard
          key={m.id}
          match={m}
          onChange={onChange}
          datalistId={datalistId}
          draggingId={draggingId}
          onDragStart={onDragStart}
          onMatchDrop={onMatchDrop}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}

// ── BracketStrip — renders one horizontal row of rounds (WB or LB) ─────────────
type BracketStripProps = {
  side: 'winners' | 'losers';
  rounds: number[];
  matchesByRound: BracketMatch[][];
  height: number;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onMatchDrop: (id: string) => void;
  onDragEnd: () => void;
};
function BracketStrip({ rounds, matchesByRound, height, onChange, datalistId, draggingId, onDragStart, onMatchDrop, onDragEnd }: BracketStripProps) {
  return (
    <div className="flex items-stretch" style={{ height }}>
      {rounds.map((_, i) => (
        <div key={i} className="flex items-stretch">
          <RoundColumn
            matches={matchesByRound[i]}
            height={height}
            onChange={onChange}
            datalistId={datalistId}
            draggingId={draggingId}
            onDragStart={onDragStart}
            onMatchDrop={onMatchDrop}
            onDragEnd={onDragEnd}
          />
          {i < rounds.length - 1 && matchesByRound[i].length >= 2 && (
            <ConnectorSVG fromMatches={matchesByRound[i]} height={height} />
          )}
          {i < rounds.length - 1 && matchesByRound[i].length < 2 && (
            <div style={{ width: CONN_W }} className="shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── AdminBracket ───────────────────────────────────────────────────────────────
type Props = {
  teams: Team[];
  matches: BracketMatch[];
  division: Division;
  teamCount: TeamCount;
  onMatchesChange: (next: BracketMatch[]) => void;
};

export default function AdminBracket({ teams, matches, division, teamCount, onMatchesChange }: Props) {
  const [scale, setScale]                        = useState(0.7);
  const [manualScale, setManual]                 = useState<number | null>(null);
  const [draggingId, setDragging]                = useState<string | null>(null);
  const [bracketView, setBracketView]            = useState<'both' | 'winners' | 'losers'>('both');
  const containerRef                             = useRef<HTMLDivElement>(null);
  const effectiveScale                           = manualScale ?? scale;

  const wbRounds = wbRoundsFor(teamCount);
  const lbRounds = lbRoundsFor(teamCount);

  // Section heights — each R1 match gets SLOT_H px of vertical space
  const h_wb = sectionH(teamCount / 2);
  const h_lb = sectionH(teamCount / 4);
  const NATURAL_H = bracketView === 'winners' ? h_wb
                  : bracketView === 'losers'  ? h_lb
                  : h_wb + SECTION_GAP + h_lb;

  // Bracket width is driven by the wider strip (LB has 2R-2 rounds, WB has R)
  const maxRounds = Math.max(wbRounds, lbRounds);
  const NATURAL_W = maxRounds * ROUND_W + (maxRounds - 1) * CONN_W + CONN_W + GF_W + WINNER_W;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setScale(Math.min(1.4, Math.max(0.2, entry.contentRect.width / NATURAL_W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [NATURAL_W]);

  function handleChange(updated: BracketMatch) {
    const prev = matches.find(m => m.id === updated.id);
    if (!prev) return;
    if (updated.status !== prev.status) {
      onMatchesChange(applyStatusChange(matches, updated, updated.status, teamCount));
    } else {
      let next = matches.map(m => m.id === updated.id ? updated : m);
      if (winner(updated) && AUTO_COMPLETE_FROM.includes(updated.status)) {
        next = applyStatusChange(next, updated, 'completed', teamCount);
      }
      onMatchesChange(next);
    }
  }

  function handleMatchDrop(targetId: string) {
    const srcId = draggingId;
    setDragging(null);
    if (!srcId || srcId === targetId) return;
    const src = matches.find(m => m.id === srcId);
    const tgt = matches.find(m => m.id === targetId);
    if (!src || !tgt) return;
    const ok = (m: BracketMatch) => m.status === 'todo' || m.status === 'next';
    if (!ok(src) || !ok(tgt)) return;
    onMatchesChange(matches.map(m => {
      if (m.id === srcId)    return { ...m, slotA: { ...tgt.slotA }, slotB: { ...tgt.slotB } };
      if (m.id === targetId) return { ...m, slotA: { ...src.slotA }, slotB: { ...src.slotB } };
      return m;
    }));
  }

  function clearTeams() {
    onMatchesChange(matches.map(m =>
      m.division !== division ? m
        : { ...m, slotA: { teamName: '', score: 0 }, slotB: { teamName: '', score: 0 } }
    ));
  }

  function autoFillTeams() {
    const divTeams  = teams.filter(t => t.division === division);
    // Highest score = seed 1 (strongest). Unscored teams are shuffled to the end.
    const withScore = [...divTeams.filter(t => t.score !== null)].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const noScore   = [...divTeams.filter(t => t.score === null)];
    for (let i = noScore.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [noScore[i], noScore[j]] = [noScore[j], noScore[i]];
    }
    // sorted[0] = seed 1 (best), sorted[1] = seed 2, …
    const sorted = [...withScore, ...noScore];

    const r1 = matches
      .filter(m => m.division === division && m.side === 'winners' && m.round === 1)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    const numMatches = r1.length;
    const T = 2 * numMatches;   // bracket team slots

    // Standard balanced seeding: expands recursively so seed 1 lands in M1 and
    // seed 2 lands in M_last (opposite sides). For 8 matches → [1,8,5,4,3,6,7,2].
    // slotB for each match = T+1 − slotA (symmetric pairing).
    function seedOrder(N: number): number[] {
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

    const slotASeeds = seedOrder(numMatches);

    onMatchesChange(matches.map(m => {
      if (m.division !== division || m.side !== 'winners' || m.round !== 1) return m;
      const i     = r1.findIndex(r => r.id === m.id);
      const aSeed = slotASeeds[i];
      const bSeed = T + 1 - aSeed;
      return {
        ...m,
        slotA: { teamName: sorted[aSeed - 1]?.name ?? '', score: 0 },
        slotB: { teamName: sorted[bSeed - 1]?.name ?? '', score: 0 },
      };
    }));
  }

  // Group matches for rendering
  const divMatches = matches.filter(m => m.division === division);

  const wbByRound = Array.from({ length: wbRounds }, (_, i) =>
    divMatches.filter(m => m.side === 'winners' && m.round === i + 1).sort((a, b) => a.matchNumber - b.matchNumber)
  );
  const lbByRound = Array.from({ length: lbRounds }, (_, i) =>
    divMatches.filter(m => m.side === 'losers' && m.round === i + 1).sort((a, b) => a.matchNumber - b.matchNumber)
  );
  const gfMatch = divMatches.find(m => m.side === 'grand-final');

  const finalWb   = wbByRound[wbRounds - 1]?.[0];
  const wbWinner  = finalWb ? winner(finalWb) : null;
  const champion  = gfMatch ? (winner(gfMatch) === 'a' ? gfMatch.slotA.teamName : winner(gfMatch) === 'b' ? gfMatch.slotB.teamName : null) : null;

  const datalistId = `bl-teams-${division}`;

  const sharedCardProps = {
    datalistId,
    draggingId,
    onDragStart: setDragging,
    onMatchDrop: handleMatchDrop,
    onDragEnd:   () => setDragging(null),
  };

  // Pad WB strip to lbRounds width by adding empty spacer columns if WB is narrower
  const wbPadCols = lbRounds - wbRounds;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
        {/* WB / LB / Both filter */}
        <div className="flex items-center gap-0.5 rounded-lg border border-white/15 bg-white/5 p-0.5 text-[0.6rem]">
          {(['both', 'winners', 'losers'] as const).map(v => (
            <button
              key={v}
              onClick={() => setBracketView(v)}
              className={cn(
                "rounded px-2 py-0.5 capitalize transition-colors",
                bracketView === v ? "bg-white/20 text-foreground" : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              {v === 'both' ? 'Both' : v === 'winners' ? 'Winners' : 'Losers'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={clearTeams}
            className="rounded-lg border border-white/25 bg-white/5 px-3 py-1 text-xs text-foreground/70 transition-colors hover:bg-red-400/10 hover:border-red-400/30 hover:text-red-300"
          >
            Clear Teams
          </button>
          <button
            onClick={autoFillTeams}
            className="rounded-lg border border-white/25 bg-white/8 px-3 py-1 text-xs text-foreground transition-colors hover:bg-white/15"
          >
            Auto Fill
          </button>
        </div>
      </div>

      {/* datalist for autocomplete */}
      <datalist id={datalistId}>
        {teams.filter(t => t.division === division).map(t => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>

      {/* scrollable bracket */}
      <div ref={containerRef} className="relative flex-1 overflow-auto">
        <div style={{ width: NATURAL_W * effectiveScale, height: NATURAL_H * effectiveScale, position: 'relative' }}>
          <div
            style={{ width: NATURAL_W, height: NATURAL_H, transform: `scale(${effectiveScale})`, transformOrigin: 'top left', position: 'absolute' }}
            className="flex items-stretch"
          >
            {/* Main bracket (WB + LB stacked) */}
            <div style={{ height: NATURAL_H }} className="flex flex-col">

              {/* ── Winners Bracket ─────────────────────────────── */}
              {bracketView !== 'losers' && (
                <>
                  <div className="shrink-0 px-1 py-0.5">
                    <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Winners Bracket</span>
                  </div>
                  <BracketStrip
                    side="winners"
                    rounds={Array.from({ length: wbRounds }, (_, i) => i + 1)}
                    matchesByRound={wbByRound}
                    height={h_wb}
                    onChange={handleChange}
                    {...sharedCardProps}
                  />
                </>
              )}

              {/* ── Section gap ──────────────────────────────────── */}
              {bracketView === 'both' && (
                <div style={{ height: SECTION_GAP }} className="shrink-0 flex items-center border-t border-b border-white/8 px-2">
                  <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Losers Bracket</span>
                </div>
              )}

              {/* ── Losers Bracket ───────────────────────────────── */}
              {bracketView !== 'winners' && (
                <>
                  {bracketView === 'losers' && (
                    <div className="shrink-0 px-1 py-0.5">
                      <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Losers Bracket</span>
                    </div>
                  )}
                  <BracketStrip
                    side="losers"
                    rounds={Array.from({ length: lbRounds }, (_, i) => i + 1)}
                    matchesByRound={lbByRound}
                    height={h_lb}
                    onChange={handleChange}
                    {...sharedCardProps}
                  />
                </>
              )}
            </div>

            {/* Padding so WB aligns with LB column count */}
            {wbPadCols > 0 && bracketView === 'both' && (
              <div style={{ width: wbPadCols * (ROUND_W + CONN_W) }} />
            )}

            {/* ── Grand Final ──────────────────────────────────── */}
            <div style={{ width: CONN_W }} className="shrink-0 flex items-center justify-center">
              <div className="h-full border-l border-white/15" />
            </div>

            <div style={{ width: GF_W, height: NATURAL_H }} className="flex shrink-0 flex-col items-center justify-center gap-2">
              <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Grand Final</span>
              {gfMatch && (
                <MatchCard
                  match={gfMatch}
                  onChange={handleChange}
                  {...sharedCardProps}
                />
              )}
            </div>

            {/* ── Champion display ─────────────────────────────── */}
            <div style={{ width: WINNER_W, height: NATURAL_H }} className="flex shrink-0 flex-col items-center justify-center">
              <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Champion</span>
              {champion && (
                <span className="mt-1 text-center text-xs font-semibold text-amber-300">🏆 {champion}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* scale slider */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-3 py-1.5">
        <span className="text-[0.55rem] text-foreground/40">Scale</span>
        <input
          type="range" min={0.2} max={1.4} step={0.05}
          value={effectiveScale}
          onChange={e => setManual(Number(e.target.value))}
          className="w-28 accent-white/50"
        />
        <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground/40">
          {Math.round(effectiveScale * 100)}%
        </span>
        {manualScale !== null && (
          <button onClick={() => setManual(null)} className="text-[0.55rem] text-foreground/40 hover:text-foreground/70">auto</button>
        )}
      </div>
    </div>
  );
}
