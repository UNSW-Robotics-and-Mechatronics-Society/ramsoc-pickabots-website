"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BracketMatch, type Division,
  type MatchStatus, type Team, type TeamCount,
  wbRoundsFor, lbRoundsFor,
  winner, applyStatusChange, isTeamNameTaken,
} from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { MATCH_DRAG_TYPE, SlotRow } from "./MatchTeamSlot";
import { useAdminPanels } from "./AdminPanelContext";

// ── layout constants ───────────────────────────────────────────────────────────
const MATCH_H      = 96;
const ROUND_W      = 188;
const CONN_W       = 44;
const PODIUM_W     = 120;
const SLOT_H       = MATCH_H + 14; // vertical space each match occupies in a column
const SECTION_GAP  = 36;           // pixels between WB and LB strips

function sectionH(r1Matches: number, slotH: number) { return r1Matches * slotH; }
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

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

const AUTO_COMPLETE_FROM: MatchStatus[] = ['todo', 'next', 'active'];

// ── MatchCard ──────────────────────────────────────────────────────────────────
type MatchCardProps = {
  match: BracketMatch;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  isValidTeamName: (matchId: string, name: string) => boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onMatchDrop: (targetId: string) => void;
  onDragEnd: () => void;
};
function MatchCard({ match, onChange, datalistId, isValidTeamName, draggingId, onDragStart, onMatchDrop, onDragEnd }: MatchCardProps) {
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

  const sideLabel =
    match.side === 'finals-semi'  ? `Finals Semi ${match.matchNumber}` :
    match.side === 'finals-third' ? '3rd Place' :
    match.side === 'finals-final' ? 'Finals' :
    `${match.side === 'winners' ? 'W' : 'L'}B R${match.round}·M${match.matchNumber}`;

  return (
    <div
      style={{ height: MATCH_H }}
      draggable={swappable}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(MATCH_DRAG_TYPE, match.id); // distinguishes from team drags
        onDragStart(match.id);
      }}
      onDragOver={e => { if (isMatchDropTgt) e.preventDefault(); }}
      onDrop={e => {
        if (e.dataTransfer.types.includes(MATCH_DRAG_TYPE)) {
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
        datalistId={datalistId} isValid={n => isValidTeamName(match.id, n)}
        onNameCommit={n => setName('a', n)} onScoreDelta={d => setScore('a', d)}
      />
      <div className="border-t border-white/[0.14]" />
      <SlotRow
        slotData={match.slotB} won={w === 'b'} lost={w !== null && w !== 'b'}
        datalistId={datalistId} isValid={n => isValidTeamName(match.id, n)}
        onNameCommit={n => setName('b', n)} onScoreDelta={d => setScore('b', d)}
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

function ConnectorSVG({ fromMatches, height, connW }: { fromMatches: BracketMatch[]; height: number; connW: number }) {
  const fromN   = fromMatches.length;
  const pairs   = fromN / 2;
  const spacing = height / fromN;
  const cx      = connW / 2;

  return (
    <svg width={connW} height={height} className="shrink-0 overflow-visible">
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
            <line x1={cx}   y1={midY} x2={connW}  y2={midY} stroke={c(bothDone)} strokeWidth={1.5} />
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
  isValidTeamName: (matchId: string, name: string) => boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onMatchDrop: (id: string) => void;
  onDragEnd: () => void;
};
function RoundColumn({ matches, height, onChange, datalistId, isValidTeamName, draggingId, onDragStart, onMatchDrop, onDragEnd }: RoundColumnProps) {
  return (
    <div style={{ width: ROUND_W, height }} className="flex shrink-0 flex-col justify-around">
      {matches.map(m => (
        <MatchCard
          key={m.id}
          match={m}
          onChange={onChange}
          datalistId={datalistId}
          isValidTeamName={isValidTeamName}
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
  connW: number;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  isValidTeamName: (matchId: string, name: string) => boolean;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onMatchDrop: (id: string) => void;
  onDragEnd: () => void;
};
function BracketStrip({ rounds, matchesByRound, height, connW, onChange, datalistId, isValidTeamName, draggingId, onDragStart, onMatchDrop, onDragEnd }: BracketStripProps) {
  return (
    <div className="flex items-stretch" style={{ height }}>
      {rounds.map((_, i) => (
        <div key={i} className="flex items-stretch">
          <RoundColumn
            matches={matchesByRound[i]}
            height={height}
            onChange={onChange}
            datalistId={datalistId}
            isValidTeamName={isValidTeamName}
            draggingId={draggingId}
            onDragStart={onDragStart}
            onMatchDrop={onMatchDrop}
            onDragEnd={onDragEnd}
          />
          {i < rounds.length - 1 && matchesByRound[i].length >= 2 && (
            <ConnectorSVG fromMatches={matchesByRound[i]} height={height} connW={connW} />
          )}
          {i < rounds.length - 1 && matchesByRound[i].length < 2 && (
            <div style={{ width: connW }} className="shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── bye handling ───────────────────────────────────────────────────────────────
/**
 * Auto-advances a winners-side match whose bracket slot has no opponent
 * (fewer real teams than bracket capacity). Round 1 byes are known from
 * seeding; a round N>1 "bye" is only resolved once BOTH of its feeder
 * matches have completed, so a genuinely pending 2-team match is never
 * short-circuited.
 */
function propagateByes(list: BracketMatch[], division: Division, teamCount: TeamCount): BracketMatch[] {
  const wbRounds = wbRoundsFor(teamCount);
  for (let round = 1; round <= wbRounds; round++) {
    for (const m of list.filter(x => x.division === division && x.side === 'winners' && x.round === round)) {
      const cur = list.find(x => x.id === m.id)!;
      if (cur.status === 'completed') continue;

      const aFilled = !!cur.slotA.teamName;
      const bFilled = !!cur.slotB.teamName;
      if (aFilled === bFilled) continue; // both filled (real match) or both empty (dead) — leave alone

      if (round > 1) {
        const feeders = list.filter(x =>
          x.division === division && x.side === 'winners' && x.round === round - 1 &&
          (x.matchNumber === 2 * cur.matchNumber - 1 || x.matchNumber === 2 * cur.matchNumber),
        );
        if (feeders.some(f => f.status !== 'completed')) continue; // a real match is still pending
      }

      const advancing = aFilled
        ? { ...cur, slotA: { ...cur.slotA, score: cur.targetScore } }
        : { ...cur, slotB: { ...cur.slotB, score: cur.targetScore } };
      list = applyStatusChange(list, advancing, 'completed', teamCount);
    }
  }
  return list;
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
  const [containerWidth, setContainerWidth] = useState(0);
  const [manualScale, setManualScale]       = useState<number | null>(null);
  const [manualStretch, setManualStretch]   = useState<number | null>(null);
  const [manualVScale, setManualVScale]     = useState<number | null>(null);
  const [draggingId, setDragging]           = useState<string | null>(null);
  const [bracketView, setBracketView]       = useState<'all' | 'winners' | 'losers' | 'knockouts' | 'finals'>('all');
  const { bracketFullscreen: fullscreen, setBracketFullscreen: setFullscreen } = useAdminPanels();
  const containerRef                        = useRef<HTMLDivElement>(null);

  const showBothSides = bracketView === 'all' || bracketView === 'knockouts';

  const wbRounds = wbRoundsFor(teamCount);
  const lbRounds = lbRoundsFor(teamCount);

  const effectiveVScale  = manualVScale ?? 1;
  const effectiveSlotH   = SLOT_H * effectiveVScale;
  const effectiveSectionGap = SECTION_GAP * effectiveVScale;

  // Section heights — each R1 match gets effectiveSlotH px of vertical space
  const h_wb = sectionH(teamCount / 2, effectiveSlotH);
  const h_lb = sectionH(teamCount / 4, effectiveSlotH);
  const NATURAL_H = bracketView === 'winners' ? h_wb
                  : bracketView === 'losers'  ? h_lb
                  : bracketView === 'finals'  ? sectionH(2, effectiveSlotH)
                  : h_wb + effectiveSectionGap + h_lb;

  const showMain   = bracketView !== 'finals';
  const showFinals = bracketView === 'all' || bracketView === 'finals';
  const maxRounds  = Math.max(wbRounds, lbRounds);
  const wbPadCols  = showBothSides ? lbRounds - wbRounds : 0;

  // Fixed-width layout units (never affected by the Stretch slider — card
  // widths always stay put so match cards never distort) vs. gap units
  // (round-to-round connectors, the WB/LB alignment pad, the finals divider)
  // which the Stretch slider grows/shrinks.
  const fixedW = (showMain ? maxRounds * ROUND_W : 0) + (showFinals ? 2 * ROUND_W + PODIUM_W : 0);
  const gapUnits =
    (showMain ? Math.max(0, maxRounds - 1) : 0) +
    Math.max(0, wbPadCols) +
    (showMain && showFinals ? 1 : 0) +
    (showFinals ? 1 : 0);
  const NATURAL_W_BASE = fixedW + gapUnits * CONN_W;

  const autoScale = containerWidth > 0 ? clamp(containerWidth / NATURAL_W_BASE, 0.2, 1.4) : 0.7;
  // Never let the manual slider zoom out past the fit-to-width point — below
  // that, the bracket would be narrower than the panel and show empty
  // background at the edges.
  const effectiveScale = Math.max(manualScale ?? autoScale, autoScale);

  // Auto-stretch fills any width left over once Scale is applied (most
  // visibly once Scale is pinned at its 1.4 ceiling on very wide screens) by
  // growing the connector/gap widths only.
  const autoStretch = containerWidth > 0 && gapUnits > 0
    ? clamp((containerWidth - fixedW * effectiveScale) / (gapUnits * CONN_W * effectiveScale), 0.3, 4)
    : 1;
  const effectiveStretch = manualStretch ?? autoStretch;
  const effectiveConnW   = CONN_W * effectiveStretch;

  const NATURAL_W = fixedW + gapUnits * effectiveConnW;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function isValidTeamName(matchId: string, name: string): boolean {
    return !isTeamNameTaken(matches, division, matchId, name);
  }

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
    // Highest seed value = seed 1 (strongest). Unseeded teams are shuffled to the end.
    const withSeed  = [...divTeams.filter(t => t.seed !== null)].sort((a, b) => (b.seed ?? 0) - (a.seed ?? 0));
    const noSeed    = [...divTeams.filter(t => t.seed === null)];
    for (let i = noSeed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [noSeed[i], noSeed[j]] = [noSeed[j], noSeed[i]];
    }
    // sorted[0] = seed 1 (best), sorted[1] = seed 2, …
    const sorted = [...withSeed, ...noSeed];

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

    let seeded = matches.map(m => {
      if (m.division !== division || m.side !== 'winners' || m.round !== 1) return m;
      const i     = r1.findIndex(r => r.id === m.id);
      const aSeed = slotASeeds[i];
      const bSeed = T + 1 - aSeed;
      return {
        ...m,
        slotA: { teamName: sorted[aSeed - 1]?.name ?? '', score: 0 },
        slotB: { teamName: sorted[bSeed - 1]?.name ?? '', score: 0 },
      };
    });

    // Byes: when there are fewer real teams than bracket slots, the present
    // (higher-seeded) team auto-advances instead of facing a blank opponent.
    seeded = propagateByes(seeded, division, teamCount);

    onMatchesChange(seeded);
  }

  // Group matches for rendering
  const divMatches = matches.filter(m => m.division === division);

  const wbByRound = Array.from({ length: wbRounds }, (_, i) =>
    divMatches.filter(m => m.side === 'winners' && m.round === i + 1).sort((a, b) => a.matchNumber - b.matchNumber)
  );
  const lbByRound = Array.from({ length: lbRounds }, (_, i) =>
    divMatches.filter(m => m.side === 'losers' && m.round === i + 1).sort((a, b) => a.matchNumber - b.matchNumber)
  );
  const finalsSemis = divMatches.filter(m => m.side === 'finals-semi').sort((a, b) => a.matchNumber - b.matchNumber);
  const finalsFinal = divMatches.find(m => m.side === 'finals-final');
  const finalsThird = divMatches.find(m => m.side === 'finals-third');

  const finalWinner = finalsFinal ? winner(finalsFinal) : null;
  const first  = finalsFinal && finalWinner === 'a' ? finalsFinal.slotA.teamName : finalsFinal && finalWinner === 'b' ? finalsFinal.slotB.teamName : null;
  const second = finalsFinal && finalWinner === 'a' ? finalsFinal.slotB.teamName : finalsFinal && finalWinner === 'b' ? finalsFinal.slotA.teamName : null;
  const thirdWinner = finalsThird ? winner(finalsThird) : null;
  const third  = finalsThird && thirdWinner === 'a' ? finalsThird.slotA.teamName : finalsThird && thirdWinner === 'b' ? finalsThird.slotB.teamName : null;

  const datalistId = `bl-teams-${division}`;

  const sharedCardProps = {
    datalistId,
    isValidTeamName,
    draggingId,
    onDragStart: setDragging,
    onMatchDrop: handleMatchDrop,
    onDragEnd:   () => setDragging(null),
  };

  return (
    <div
      className={cn("flex flex-col", fullscreen ? "fixed inset-0 z-40 bg-black" : "h-full")}
      // Same "sumobots gears" background the rest of the admin page uses
      // (src/app/admin/layout.tsx), so full screen doesn't look like a
      // different, plainer surface.
      style={fullscreen ? { backgroundImage: "url('/background_gears.svg')" } : undefined}
    >
      {/* toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
        {/* All / Winners / Losers / Knockouts / Finals filter */}
        <div className="flex items-center gap-0.5 rounded-lg border border-white/15 bg-white/5 p-0.5 text-[0.6rem]">
          {(['all', 'winners', 'losers', 'knockouts', 'finals'] as const).map(v => (
            <button
              key={v}
              onClick={() => setBracketView(v)}
              className={cn(
                "rounded px-2 py-0.5 capitalize transition-colors",
                bracketView === v ? "bg-white/20 text-foreground" : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              {v === 'all' ? 'All' : v === 'winners' ? 'Winners' : v === 'losers' ? 'Losers' : v === 'knockouts' ? 'Knockouts' : 'Finals'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className={cn(
              "rounded-lg border px-2 py-1 text-[0.6rem] font-medium transition-colors",
              fullscreen
                ? "border-white/30 bg-white/20 text-foreground"
                : "border-white/15 bg-white/5 text-foreground/50 hover:text-foreground/80",
            )}
          >
            {fullscreen ? 'Exit Full Screen' : 'Full Screen'}
          </button>
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

      {/* scrollable bracket — content centers horizontally when narrower than the panel */}
      <div ref={containerRef} className="relative flex-1 overflow-auto">
       <div className="flex min-h-full min-w-full items-start justify-center">
        <div style={{ width: NATURAL_W * effectiveScale, height: NATURAL_H * effectiveScale, position: 'relative' }}>
          <div
            style={{ width: NATURAL_W, height: NATURAL_H, transform: `scale(${effectiveScale})`, transformOrigin: 'top left', position: 'absolute' }}
            className="flex items-stretch"
          >
            {/* Main bracket (WB + LB stacked) — wrapped in a silver box, same
                treatment as the gold Finals Day box below. */}
            {showMain && (
              <div className="flex shrink-0 rounded-xl bg-gradient-to-br from-slate-300/10 via-slate-200/5 to-transparent px-2 py-2 ring-1 ring-slate-300/20">
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
                        connW={effectiveConnW}
                        onChange={handleChange}
                        {...sharedCardProps}
                      />
                    </>
                  )}

                  {/* ── Section gap ──────────────────────────────────── */}
                  {showBothSides && (
                    <div style={{ height: effectiveSectionGap }} className="shrink-0 flex items-center border-t border-b border-white/8 px-2">
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
                        connW={effectiveConnW}
                        onChange={handleChange}
                        {...sharedCardProps}
                      />
                    </>
                  )}

                </div>
              </div>
            )}

            {/* Padding so WB aligns with LB column count */}
            {wbPadCols > 0 && showBothSides && (
              <div style={{ width: wbPadCols * (ROUND_W + effectiveConnW) }} />
            )}

            {/* ── Finals Day ─────────────────────────────────────── */}
            {showFinals && (
              <>
                {showMain && (
                  <div style={{ width: effectiveConnW }} className="shrink-0 flex items-center justify-center">
                    <div className="h-full border-l-2 border-dashed border-amber-300/40" />
                  </div>
                )}

                <div
                  className="flex shrink-0 items-stretch rounded-xl bg-gradient-to-br from-amber-400/15 via-amber-300/5 to-transparent px-2 pt-2 pb-40 ring-1 ring-amber-300/25"
                >
                  <div className="flex flex-col">
                    <div className="shrink-0 px-1 py-0.5">
                      <span className="text-[0.55rem] uppercase tracking-widest text-amber-200/80">Finals Day</span>
                    </div>
                    <div className="flex items-stretch">
                      {/* Semis column */}
                      <div style={{ width: ROUND_W, height: NATURAL_H }} className="flex shrink-0 flex-col justify-around">
                        {finalsSemis.map(m => (
                          <MatchCard key={m.id} match={m} onChange={handleChange} {...sharedCardProps} />
                        ))}
                      </div>

                      {finalsSemis.length >= 2 ? (
                        <ConnectorSVG fromMatches={finalsSemis} height={NATURAL_H} connW={effectiveConnW} />
                      ) : (
                        <div style={{ width: effectiveConnW }} className="shrink-0" />
                      )}

                      {/* Final + 3rd place column — height is intentionally
                          unset so it grows to fit both stacked cards; the
                          gold box around all of this auto-sizes to whichever
                          column ends up tallest, so nothing gets clipped. */}
                      <div style={{ width: ROUND_W }} className="flex shrink-0 flex-col items-stretch justify-center gap-3 self-center">
                        {finalsFinal && (
                          <div className="flex flex-col gap-1">
                            <span className="text-center text-[0.5rem] uppercase tracking-widest text-amber-200/70">Grand Final</span>
                            <MatchCard match={finalsFinal} onChange={handleChange} {...sharedCardProps} />
                          </div>
                        )}
                        {finalsThird && (
                          <div className="flex flex-col gap-1">
                            <span className="text-center text-[0.5rem] uppercase tracking-widest text-foreground/40">3rd Place</span>
                            <MatchCard match={finalsThird} onChange={handleChange} {...sharedCardProps} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Podium ───────────────────────────────────────── */}
                  <div style={{ width: PODIUM_W }} className="flex shrink-0 flex-col items-center justify-center gap-1.5">
                    <span className="mb-1 text-[0.55rem] uppercase tracking-widest text-amber-200/80">Podium</span>
                    <div className={cn(
                      "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[0.65rem]",
                      first ? "bg-amber-400/20 text-amber-200" : "text-foreground/25",
                    )}>
                      <span>🥇</span><span className="truncate">{first ?? '—'}</span>
                    </div>
                    <div className={cn(
                      "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[0.65rem]",
                      second ? "bg-slate-300/15 text-slate-200" : "text-foreground/25",
                    )}>
                      <span>🥈</span><span className="truncate">{second ?? '—'}</span>
                    </div>
                    <div className={cn(
                      "flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[0.65rem]",
                      third ? "bg-orange-500/15 text-orange-200" : "text-foreground/25",
                    )}>
                      <span>🥉</span><span className="truncate">{third ?? '—'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
       </div>
      </div>

      {/* sliders */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[0.55rem] text-foreground/40">Scale</span>
          <input
            type="range" min={autoScale} max={1.4} step={0.05}
            value={effectiveScale}
            onChange={e => setManualScale(Number(e.target.value))}
            className="w-24 accent-white/50"
          />
          <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground/40">
            {Math.round(effectiveScale * 100)}%
          </span>
          {manualScale !== null && (
            <button onClick={() => setManualScale(null)} className="text-[0.55rem] text-foreground/40 hover:text-foreground/70">auto</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[0.55rem] text-foreground/40">Stretch</span>
          <input
            type="range" min={0.3} max={4} step={0.05}
            value={effectiveStretch}
            onChange={e => setManualStretch(Number(e.target.value))}
            className="w-24 accent-white/50"
          />
          <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground/40">
            {Math.round(effectiveStretch * 100)}%
          </span>
          {manualStretch !== null && (
            <button onClick={() => setManualStretch(null)} className="text-[0.55rem] text-foreground/40 hover:text-foreground/70">auto</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[0.55rem] text-foreground/40">V-Scale</span>
          <input
            type="range" min={0.5} max={2.5} step={0.05}
            value={effectiveVScale}
            onChange={e => setManualVScale(Number(e.target.value))}
            className="w-24 accent-white/50"
          />
          <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground/40">
            {Math.round(effectiveVScale * 100)}%
          </span>
          {manualVScale !== null && (
            <button onClick={() => setManualVScale(null)} className="text-[0.55rem] text-foreground/40 hover:text-foreground/70">reset</button>
          )}
        </div>
      </div>
    </div>
  );
}
