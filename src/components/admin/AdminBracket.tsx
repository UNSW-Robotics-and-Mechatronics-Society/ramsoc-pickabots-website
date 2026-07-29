"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BracketMatch, type Division,
  type MatchStatus, type Team, type TeamCount,
  wbRoundsFor, lbRoundsFor,
  winner, applyStatusChange, isTeamSwapOnly, wildcardLbRound, computeSlotDefaults,
} from "@/lib/mock-data";
import {
  type MatchSchedule,
  editMatchTime, resetMatchTime, scheduleOrder,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { MATCH_DRAG_TYPE, SlotRow, TimeCell } from "./MatchTeamSlot";
import { useAdminPanels } from "./AdminPanelContext";
import { useTeamFilter, TeamFilterBar, isMatchDimmed } from "./TeamFilterBar";
import VotingToggle from "./VotingToggle";
import ConfirmDialog from "./ConfirmDialog";
import AutoFillModePicker from "./AutoFillModePicker";
import type { AutoFillMode } from "@/lib/seeds";

// ── layout constants ───────────────────────────────────────────────────────────
const MATCH_H      = 116; // +20 over the base card height, for the time row
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
  dimmed?: boolean;
  time?: number;
  order?: number;
  onTimeChange?: (matchId: string, minute: number) => void;
  /** Whether this match's time was set by hand — read off the schedule rather
   *  than passed per-card, so it rides along in sharedCardProps like getTime. */
  getTimePinned?: (matchId: string) => boolean;
  onTimeReset?: (matchId: string) => void;
  /** Feeder placeholders for empty slots (e.g. { a: "Winner of R64 M3" }). */
  defaults?: { a?: string; b?: string };
};
function MatchCard({
  match, onChange, datalistId, isValidTeamName, draggingId, onDragStart, onMatchDrop, onDragEnd, dimmed, time, order, onTimeChange, getTimePinned, onTimeReset, defaults,
}: MatchCardProps) {
  const w = winner(match);
  const swappable       = match.status === 'todo' || match.status === 'next';
  const isBeingDragged  = draggingId === match.id;
  const isMatchDropTgt  = draggingId !== null && draggingId !== match.id && swappable;

  // Todo/completed/skipped matches can be scored at any time. For ACTIVE and
  // NEXT matches (either can now have voting open) we keep the original rule:
  // scoring is only allowed once voting is closed, so votes are locked in
  // before any score is entered.
  const scoringAllowed = (match.status === 'active' || match.status === 'next') ? !match.votingOpen : true;

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
        "relative flex flex-col rounded-md border bg-[#0d1018] text-foreground transition-all",
        STATUS_BORDER[match.status],
        isBeingDragged  && "opacity-30",
        isMatchDropTgt  && "ring-2 ring-white/60 ring-dashed",
        swappable       && "cursor-grab active:cursor-grabbing",
        dimmed          && "opacity-30 grayscale-70",
      )}
    >
      {(order !== undefined || match.status === 'active' || match.status === 'next') && (
        <div className="absolute right-1 top-1 z-20 flex items-center gap-1">
          {/* Play order — where this match sits in the running order. Subtle
              tint (orange for Standards, green for Open) so it's not obtrusive. */}
          {order !== undefined && (
            <span
              title="Play order"
              className={cn(
                "rounded px-1 text-[0.6rem] font-bold leading-normal",
                match.division === 'open'
                  ? "bg-[#4ADE80]/15 text-[#4ADE80]"
                  : "bg-[#FF6B00]/15 text-[#FF6B00]",
              )}
            >
              {order}
            </span>
          )}
          {(match.status === 'active' || match.status === 'next') && (
            <VotingToggle
              open={match.votingOpen}
              onToggle={() => onChange({ ...match, votingOpen: !match.votingOpen })}
            />
          )}
        </div>
      )}
      {time !== undefined && (
        <div
          className="flex shrink-0 items-center justify-center border-b border-white/[0.14] py-1"
          onMouseDown={e => e.stopPropagation()}
        >
          <TimeCell
            minute={time}
            pinned={getTimePinned?.(match.id)}
            onCommit={min => onTimeChange?.(match.id, min)}
            onReset={onTimeReset && (() => onTimeReset(match.id))}
          />
        </div>
      )}
      <SlotRow
        slotData={match.slotA} won={w === 'a'} lost={w !== null && w !== 'a'}
        datalistId={datalistId} isValid={n => isValidTeamName(match.id, n)}
        onNameCommit={n => setName('a', n)}
        onScoreDelta={scoringAllowed ? d => setScore('a', d) : undefined}
        placeholder={defaults?.a}
      />
      <div className="border-t border-white/[0.14]" />
      <SlotRow
        slotData={match.slotB} won={w === 'b'} lost={w !== null && w !== 'b'}
        datalistId={datalistId} isValid={n => isValidTeamName(match.id, n)}
        onNameCommit={n => setName('b', n)}
        onScoreDelta={scoringAllowed ? d => setScore('b', d) : undefined}
        placeholder={defaults?.b}
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

// ── WildcardCard ───────────────────────────────────────────────────────────────
// A holding box that lives OUTSIDE the bracket tree. The admin types a
// knocked-out team into it — by definition a team already standing elsewhere in
// the bracket, which is fine now that any slot takes any team (see
// isTeamSwapOnly) — then "Send in" marks it completed, which applyStatusChange
// turns into slot B of the losers-bracket match it feeds.
function WildcardCard({
  match, index, target, onChange, datalistId, isValidTeamName,
}: {
  match: BracketMatch;
  index: number;
  target: string;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  isValidTeamName: (matchId: string, name: string) => boolean;
}) {
  const sent = match.status === 'completed';
  const name = match.slotA.teamName;

  return (
    <div
      style={{ width: ROUND_W }}
      className={cn(
        "flex flex-col rounded-md border bg-[#1e0e30] text-foreground transition-all",
        "border-[#D8B4FE] shadow-[0_0_10px_#D8B4FE55]",
        sent && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.14] px-1.5 py-1">
        <span className="text-[0.55rem] font-semibold uppercase tracking-widest text-[#D8B4FE]">
          Wildcard {index}
        </span>
        <span className="text-[0.5rem] text-foreground/40">→ {target}</span>
      </div>

      <SlotRow
        slotData={match.slotA}
        won={false}
        lost={false}
        datalistId={datalistId}
        isValid={n => isValidTeamName(match.id, n)}
        onNameCommit={n => onChange({ ...match, slotA: { ...match.slotA, teamName: n } })}
        placeholder={`Wildcard Team ${index}`}
      />

      <div className="flex items-center justify-between border-t border-white/[0.14] px-1.5 py-1">
        <span className="text-[0.5rem] text-foreground/50">
          {sent ? 'In bracket' : name ? 'Ready' : 'Empty'}
        </span>
        <button
          type="button"
          disabled={!name}
          onClick={() => onChange({ ...match, status: sent ? 'todo' : 'completed' })}
          className={cn(
            "rounded border px-1.5 py-0.5 text-[0.6rem] font-medium transition-colors",
            !name
              ? "cursor-not-allowed border-white/10 text-foreground/25"
              : sent
                ? "border-white/25 text-foreground/60 hover:text-foreground"
                : "border-[#D8B4FE]/60 bg-[#D8B4FE]/15 text-[#D8B4FE] hover:bg-[#D8B4FE]/25",
          )}
        >
          {sent ? 'Pull back' : 'Send in'}
        </button>
      </div>
    </div>
  );
}

/** The "Wildcard" heading + both boxes, offset to sit above the round they feed. */
function WildcardRow({
  boxes, leftOffset, gap, targetLabel, onChange, datalistId, isValidTeamName,
}: {
  boxes: BracketMatch[];
  leftOffset: number;
  gap: number;
  targetLabel: (matchNumber: number) => string;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  isValidTeamName: (matchId: string, name: string) => boolean;
}) {
  if (boxes.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col pb-2" style={{ paddingLeft: leftOffset }}>
      <span className="pb-1 text-[0.55rem] font-semibold uppercase tracking-widest text-[#D8B4FE]">
        Wildcard
      </span>
      <div className="flex" style={{ gap }}>
        {boxes.map((b, i) => (
          <WildcardCard
            key={b.id}
            match={b}
            index={i + 1}
            target={targetLabel(b.matchNumber)}
            onChange={onChange}
            datalistId={datalistId}
            isValidTeamName={isValidTeamName}
          />
        ))}
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
  filterSet?: Set<string>;
  getTime: (matchId: string) => number | undefined;
  getOrder: (matchId: string) => number | undefined;
  getDefaults: (matchId: string) => { a?: string; b?: string } | undefined;
  onTimeChange: (matchId: string, minute: number) => void;
  getTimePinned: (matchId: string) => boolean;
  onTimeReset: (matchId: string) => void;
};
function RoundColumn({
  matches, height, onChange, datalistId, isValidTeamName, draggingId, onDragStart, onMatchDrop, onDragEnd, filterSet, getTime, getOrder, getDefaults, onTimeChange, getTimePinned, onTimeReset,
}: RoundColumnProps) {
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
          dimmed={!!filterSet && isMatchDimmed(m, filterSet)}
          time={getTime(m.id)}
          order={getOrder(m.id)}
          defaults={getDefaults(m.id)}
          onTimeChange={onTimeChange}
          getTimePinned={getTimePinned}
          onTimeReset={onTimeReset}
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
  filterSet?: Set<string>;
  getTime: (matchId: string) => number | undefined;
  getOrder: (matchId: string) => number | undefined;
  getDefaults: (matchId: string) => { a?: string; b?: string } | undefined;
  onTimeChange: (matchId: string, minute: number) => void;
  getTimePinned: (matchId: string) => boolean;
  onTimeReset: (matchId: string) => void;
};
function BracketStrip({
  rounds, matchesByRound, height, connW, onChange, datalistId, isValidTeamName, draggingId, onDragStart, onMatchDrop, onDragEnd, filterSet, getTime, getOrder, getDefaults, onTimeChange, getTimePinned, onTimeReset,
}: BracketStripProps) {
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
            filterSet={filterSet}
            getTime={getTime}
            getOrder={getOrder}
            getDefaults={getDefaults}
            onTimeChange={onTimeChange}
            getTimePinned={getTimePinned}
            onTimeReset={onTimeReset}
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



// ── AdminBracket ───────────────────────────────────────────────────────────────
type Props = {
  teams: Team[];
  matches: BracketMatch[];
  division: Division;
  teamCount: TeamCount;
  schedule: MatchSchedule;
  onMatchesChange: (next: BracketMatch[]) => void;
  onScheduleChange: (s: MatchSchedule) => void;
  /** Reset the current division's bracket and re-seed Round 1 from its
   * In-Bracket teams. Implemented in AdminPageClient so the Settings panel's
   * post-import prompt can reuse it; this component only triggers it (behind a
   * confirm). Refuses, with an error dialog raised there, if the division has
   * more in-bracket teams than the bracket has slots. */
  onAutoFill: (mode: AutoFillMode) => void;
};

export default function AdminBracket({ teams, matches, division, teamCount, schedule, onMatchesChange, onScheduleChange, onAutoFill }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [manualScale, setManualScale]       = useState<number | null>(null);
  const [manualStretch, setManualStretch]   = useState<number | null>(null);
  const [manualVScale, setManualVScale]     = useState<number | null>(null);
  const [draggingId, setDragging]           = useState<string | null>(null);
  const [bracketView, setBracketView]       = useState<'all' | 'winners' | 'losers' | 'knockouts' | 'finals'>('all');
  const [confirmAutoFill, setConfirmAutoFill] = useState(false);
  // Round 1 layout for the next Auto Fill — a per-run choice, not a saved setting.
  const [autoFillMode, setAutoFillMode] = useState<AutoFillMode>('worst-plays-best');
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

  // Any team can go in any slot, including one already standing elsewhere in the
  // bracket — see isTeamSwapOnly for why the duplicate guard had to go.
  const isValidTeamName: (matchId: string, name: string) => boolean = () => true;

  // Every edit EXCEPT a manual team swap goes through applyStatusChange against
  // the ORIGINAL array — not just status changes. It's what writes advancement
  // when a match completes and retracts it when a match stops being completed or
  // its winner changes, so a corrected score can't leave a stale team standing in
  // the next round. (It must see the pre-edit array to know what to retract.)
  //
  // A swap takes the short path instead: write that slot and touch nothing else,
  // so every match already logged downstream keeps its teams and scores. See
  // isTeamSwapOnly.
  function handleChange(updated: BracketMatch) {
    const prev = matches.find(m => m.id === updated.id);
    if (!prev) return;
    if (isTeamSwapOnly(prev, updated)) {
      onMatchesChange(matches.map(m => (m.id === updated.id ? updated : m)));
      return;
    }
    // A score reaching the target auto-completes the match.
    const status: MatchStatus = winner(updated) && AUTO_COMPLETE_FROM.includes(updated.status)
      ? 'completed'
      : updated.status;
    onMatchesChange(applyStatusChange(matches, updated, status, teamCount));
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

  // Group matches for rendering
  const divMatches = matches.filter(m => m.division === division);
  // Feeder placeholder text for empty slots ("Winner of R64 M3", "Wildcard
  // Team 1", …) — the same map the public bracket and match list already use,
  // so an empty slot reads the same in the admin as it does publicly.
  const slotDefaults = computeSlotDefaults(matches, division, teamCount);
  const getDefaults = (matchId: string) => slotDefaults.get(matchId);

  const {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  } = useTeamFilter(divMatches);

  const wbByRound = Array.from({ length: wbRounds }, (_, i) =>
    divMatches.filter(m => m.side === 'winners' && m.round === i + 1).sort((a, b) => a.matchNumber - b.matchNumber)
  );
  // Wildcard holding boxes — side 'wildcard', so they're in neither strip and
  // have to be rendered separately (this is why they were invisible here).
  const wildcardRound = wildcardLbRound(teamCount);
  const wildcardBoxes = divMatches
    .filter(m => m.side === 'wildcard')
    .sort((a, b) => a.matchNumber - b.matchNumber);
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

  const entryByMatchId = new Map(schedule.rings.flat().map(e => [e.matchId, e]));
  function getTime(matchId: string): number | undefined { return entryByMatchId.get(matchId)?.startMinute; }
  function getTimePinned(matchId: string): boolean { return !!entryByMatchId.get(matchId)?.pinned; }
  const orderByMatchId = scheduleOrder(schedule);
  function getOrder(matchId: string): number | undefined { return orderByMatchId.get(matchId); }
  function handleTimeChange(matchId: string, minute: number) {
    onScheduleChange(editMatchTime(schedule, matches, matchId, minute));
  }
  function handleTimeReset(matchId: string) {
    onScheduleChange(resetMatchTime(schedule, matches, matchId));
  }

  const sharedCardProps = {
    datalistId,
    isValidTeamName,
    draggingId,
    onDragStart: setDragging,
    onMatchDrop: handleMatchDrop,
    onDragEnd:   () => setDragging(null),
    getTime,
    getOrder,
    getDefaults,
    onTimeChange: handleTimeChange,
    getTimePinned,
    onTimeReset: handleTimeReset,
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-1.5">
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

        {/* Team filter — type/pick a team to dim every other match on the bracket */}
        <TeamFilterBar
          teamInput={teamInput}
          onInputChange={setTeamInput}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          teamSuggestions={teamSuggestions}
          teamFilters={teamFilters}
          onAdd={addTeamFilter}
          onRemove={removeTeamFilter}
        />

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
            onClick={() => setConfirmAutoFill(true)}
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
                        filterSet={filterSet}
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
                      {/* Wildcard boxes — outside the bracket tree, offset to
                          sit above the losers round they feed into. */}
                      {wildcardRound !== null && (
                        <WildcardRow
                          boxes={wildcardBoxes}
                          leftOffset={(wildcardRound - 1) * (ROUND_W + effectiveConnW)}
                          gap={effectiveConnW}
                          targetLabel={n => `LB R${wildcardRound}·M${n}`}
                          onChange={handleChange}
                          datalistId={sharedCardProps.datalistId}
                          isValidTeamName={sharedCardProps.isValidTeamName}
                        />
                      )}
                      <BracketStrip
                        side="losers"
                        rounds={Array.from({ length: lbRounds }, (_, i) => i + 1)}
                        matchesByRound={lbByRound}
                        height={h_lb}
                        connW={effectiveConnW}
                        onChange={handleChange}
                        filterSet={filterSet}
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
                          <MatchCard key={m.id} match={m} onChange={handleChange} dimmed={isMatchDimmed(m, filterSet)} time={getTime(m.id)} order={getOrder(m.id)} defaults={getDefaults(m.id)} {...sharedCardProps} />
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
                            <MatchCard match={finalsFinal} onChange={handleChange} dimmed={isMatchDimmed(finalsFinal, filterSet)} time={getTime(finalsFinal.id)} order={getOrder(finalsFinal.id)} defaults={getDefaults(finalsFinal.id)} {...sharedCardProps} />
                          </div>
                        )}
                        {finalsThird && (
                          <div className="flex flex-col gap-1">
                            <span className="text-center text-[0.5rem] uppercase tracking-widest text-foreground/40">3rd Place</span>
                            <MatchCard match={finalsThird} onChange={handleChange} dimmed={isMatchDimmed(finalsThird, filterSet)} time={getTime(finalsThird.id)} order={getOrder(finalsThird.id)} defaults={getDefaults(finalsThird.id)} {...sharedCardProps} />
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

      {/* Confirm auto-fill (resets the bracket, re-seeds Round 1 from the In-Bracket teams) */}
      {confirmAutoFill && (
        <ConfirmDialog
          wide
          title="Auto-fill the bracket?"
          message="This whole bracket resets — every round's teams, scores, results and wildcard boxes are cleared. Round 1 is then seeded from the In-Bracket teams (seed 1 is the top seed; unseeded teams are placed at random behind the seeded ones). Teams with In Bracket turned off are left out. Exhibition matches are kept. This can't be undone."
          confirmLabel="Auto Fill"
          onConfirm={() => { onAutoFill(autoFillMode); setConfirmAutoFill(false); }}
          onCancel={() => setConfirmAutoFill(false)}
        >
          <AutoFillModePicker value={autoFillMode} onChange={setAutoFillMode} />
        </ConfirmDialog>
      )}
    </div>
  );
}
