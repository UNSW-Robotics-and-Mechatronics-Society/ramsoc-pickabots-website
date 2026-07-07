"use client";

import { useEffect, useState } from "react";
import {
  type BracketMatch, type Division, type MatchStatus, type Team, type TeamCount,
  winner, applyStatusChange, isTeamNameTaken,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
} from "@/lib/mock-data";
import {
  type MatchSchedule, type ConcurrentRings,
  START_MINUTE, formatTime, parseTimeInput,
  changeRings, changeTimings, swapMatchIds, editMatchTime,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { MATCH_DRAG_TYPE, SlotRow } from "./MatchTeamSlot";

const RING_OPTIONS: ConcurrentRings[] = [1, 2, 3, 4];
const AUTO_COMPLETE_FROM: MatchStatus[] = ['todo', 'next', 'active'];

const STATUS_LABEL: Record<MatchStatus, string> = {
  todo: 'To Do', next: 'Next', active: 'Active', completed: 'Done', skipped: 'Skip',
};
const STATUS_TEXT: Record<MatchStatus, string> = {
  todo: 'text-foreground', next: 'text-yellow-400', active: 'text-green-400',
  completed: 'text-white/50', skipped: 'text-red-400',
};

// ── layout constants ─────────────────────────────────────────────────────────
const AXIS_W    = 56;  // shared left time-axis column width
const RING_W    = 176; // each ring's match-column width — always constant
const HEADER_H  = 22;  // sticky header row height
const CARD_H    = 100; // match card height — always constant, regardless of match length

/** One ring's full column (axis + matches) — the panel should never be
 * resized narrower than this, so at least one ring is always fully visible. */
export const MIN_MATCH_LIST_W = AXIS_W + RING_W;

function matchLabel(m: BracketMatch, teamCount: TeamCount): string {
  if (m.side === 'finals-semi')  return `Finals Semi ${m.matchNumber}`;
  if (m.side === 'finals-third') return '3rd Place';
  if (m.side === 'finals-final') return 'Finals';
  const total = m.side === 'winners' ? wbRoundsFor(teamCount) : lbRoundsFor(teamCount);
  return m.side === 'winners'
    ? wbRoundLabel(m.round, total)
    : lbRoundLabel(m.round, total);
}

// ── TimeCell — the shared axis label doubles as the time editor ───────────────

type TimeCellProps = { minute: number; onCommit: (minute: number) => void };

function TimeCell({ minute, onCommit }: TimeCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');

  function startEdit() { setDraft(formatTime(minute)); setEditing(true); }
  function commit() { onCommit(parseTimeInput(draft, minute)); setEditing(false); }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-14 rounded bg-white/10 px-1 py-0.5 text-center text-[0.55rem] text-foreground outline-none ring-1 ring-white/30"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Click to edit this match's time"
      className="text-[0.55rem] tabular-nums text-foreground/50 transition-colors hover:text-foreground/80"
    >
      {formatTime(minute)}
    </button>
  );
}

// ── NumInput ──────────────────────────────────────────────────────────────────

type NumInputProps = { value: number; min?: number; max?: number; onChange: (v: number) => void };

function NumInput({ value, min = 1, max = 60, onChange }: NumInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => { setDraft(String(value)); }, [value]);

  function commit() {
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v >= min && v <= max) {
      onChange(v);
    } else {
      setDraft(String(value));
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter')  commit();
        if (e.key === 'Escape') setDraft(String(value));
      }}
      className="w-10 rounded bg-white/10 px-1.5 py-0.5 text-center text-[0.6rem] text-foreground outline-none ring-1 ring-white/20 focus:ring-white/40"
    />
  );
}

// ── MatchCard — fixed size always, regardless of match length ─────────────────

type MatchCardProps = {
  match: BracketMatch;
  teamCount: TeamCount;
  onDrop: (srcId: string) => void;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  isValidTeamName: (name: string) => boolean;
};

function MatchCard({
  match, teamCount,
  onDrop, onChange, datalistId, isValidTeamName,
}: MatchCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver,   setDragOver]   = useState(false);

  const w = winner(match);
  const isFinals = match.side === 'finals-semi' || match.side === 'finals-third' || match.side === 'finals-final';

  const statusClass =
    match.status === 'active'    ? 'border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.5)] bg-green-400/10' :
    match.status === 'next'      ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.45)] bg-yellow-400/10' :
    match.status === 'completed' ? 'border-white/25 opacity-70' :
    match.status === 'skipped'   ? 'border-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]' :
    'border-white/[0.28]';

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

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(MATCH_DRAG_TYPE, match.id);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const src = e.dataTransfer.getData(MATCH_DRAG_TYPE);
        if (src && src !== match.id) onDrop(src);
      }}
      className={cn(
        "flex h-full cursor-grab flex-col overflow-hidden rounded-md border bg-[#0d1018] text-foreground select-none transition-all",
        statusClass,
        isDragging && 'opacity-30',
        dragOver   && 'ring-1 ring-white/50',
      )}
    >
      {/* Header: label + status (no time here — edit it from the axis) */}
      <div className="flex items-center justify-between gap-1 px-1.5 pt-1 pb-0.5">
        <span className="truncate text-[0.55rem] uppercase leading-none tracking-wider text-foreground/50">
          {matchLabel(match, teamCount)}
          {!isFinals && `·M${match.matchNumber}`}
        </span>
        <select
          value={match.status}
          onChange={e => onChange({ ...match, status: e.target.value as MatchStatus })}
          onMouseDown={e => e.stopPropagation()}
          className={cn(
            "shrink-0 cursor-pointer rounded border border-white/30 bg-black/60 px-1 py-0.5 text-[0.5rem] font-medium outline-none",
            STATUS_TEXT[match.status],
          )}
        >
          {(['todo', 'next', 'active', 'completed', 'skipped'] as MatchStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <SlotRow
        slotData={match.slotA}
        won={w === 'a'} lost={w !== null && w !== 'a'}
        datalistId={datalistId}
        isValid={isValidTeamName}
        onNameCommit={n => setName('a', n)}
        onScoreDelta={d => setScore('a', d)}
      />
      <div className="border-t border-white/[0.14]" />

      <SlotRow
        slotData={match.slotB}
        won={w === 'b'} lost={w !== null && w !== 'b'}
        datalistId={datalistId}
        isValid={isValidTeamName}
        onNameCommit={n => setName('b', n)}
        onScoreDelta={d => setScore('b', d)}
      />

      <div className="flex items-center justify-end border-t border-white/[0.14] px-1.5 py-1">
        <label className="flex items-center gap-0.5 text-[0.5rem] text-foreground/50">
          Win:
          <input
            type="text"
            inputMode="numeric"
            value={match.targetScore}
            onMouseDown={e => e.stopPropagation()}
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

// ── MatchesPanel ──────────────────────────────────────────────────────────────

type Props = {
  matches:          BracketMatch[];
  division:         Division;
  teamCount:        TeamCount;
  schedule:         MatchSchedule;
  teams:            Team[];
  onScheduleChange: (s: MatchSchedule) => void;
  onMatchesChange:  (matches: BracketMatch[]) => void;
};

export default function MatchesPanel({
  matches, division, teamCount, schedule, teams, onScheduleChange, onMatchesChange,
}: Props) {
  const matchById = new Map(
    matches.filter(m => m.division === division).map(m => [m.id, m]),
  );

  function handleMatchChange(updated: BracketMatch) {
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

  const datalistId = `ms-teams-${division}`;

  // One shared axis: every ring uses the same start-time reference and the
  // same pixel-per-minute density, so a given clock time lines up at the
  // same row across every ring — but each ring still shows and edits its own
  // matches' times individually. The density is derived from the fixed card
  // height so a match's box always exactly fills its own slot — card size
  // never changes, only the (visible) gap after it grows/shrinks with gap time.
  const allEntries = schedule.rings.flat();
  const isEmpty = allEntries.length === 0;
  const starts = allEntries.map(e => e.startMinute);
  const globalStart = starts.length ? Math.min(...starts) : START_MINUTE;
  const globalEnd = starts.length
    ? Math.max(...starts) + schedule.matchMinutes + schedule.gapMinutes
    : globalStart + schedule.matchMinutes + schedule.gapMinutes;
  const totalMinutes = Math.max(1, globalEnd - globalStart);
  const pxPerMin = CARD_H / schedule.matchMinutes;
  const canvasH = totalMinutes * pxPerMin;
  const yFor = (minute: number) => (minute - globalStart) * pxPerMin;

  return (
    <div className="@container flex h-full flex-col">
      {/* Datalist for team autocomplete */}
      <datalist id={datalistId}>
        {teams.filter(t => t.division === division).map(t => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>

      {/* Toolbar — stays one line as the panel narrows; Gap disappears
          first (least critical to always see), then Match, then the
          divider; Rings (the control that reshapes the whole layout)
          always stays. */}
      <div className="flex shrink-0 flex-nowrap items-center gap-x-3 gap-y-1 overflow-hidden border-b border-white/10 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-0.5 text-[0.55rem] uppercase tracking-widest text-foreground/40">Rings</span>
          {RING_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => onScheduleChange(changeRings(schedule, matches, n))}
              className={cn(
                "rounded px-2 py-0.5 text-[0.6rem] font-medium transition-colors",
                schedule.concurrentRings === n
                  ? "bg-white/20 text-foreground"
                  : "text-foreground/40 hover:text-foreground/70",
              )}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="h-3 w-px shrink-0 bg-white/15 @max-[180px]:hidden" />

        {/* Match/Gap apply globally to every not-yet-completed match across
            all rings (changeTimings freezes completed matches' times). Card
            size never changes with these — only the axis spacing does. */}
        <div className="flex shrink-0 items-center gap-1.5 @max-[180px]:hidden">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Match</span>
          <NumInput
            value={schedule.matchMinutes}
            onChange={v => onScheduleChange(changeTimings(schedule, matches, v, schedule.gapMinutes))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 @max-[260px]:hidden">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Gap</span>
          <NumInput
            value={schedule.gapMinutes}
            onChange={v => onScheduleChange(changeTimings(schedule, matches, schedule.matchMinutes, v))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>
      </div>

      {/* Match list — one shared scale, one scroll; each ring keeps its own
          axis column so every match's time is still edited individually.
          Extra right padding keeps the scrollbar off the match cards. */}
      <div className="min-h-0 flex-1 overflow-auto pr-10">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-foreground/30">No matches scheduled</p>
          </div>
        ) : (
          <div className="flex items-start">
            {schedule.rings.map((ring, ri) => (
              <div key={ri} className="flex shrink-0 flex-col border-l border-white/5">
                <div
                  className="sticky top-0 z-10 border-b border-white/10 bg-black/80 text-center text-[0.55rem] uppercase tracking-widest text-foreground/40 backdrop-blur-sm"
                  style={{ height: HEADER_H, lineHeight: `${HEADER_H}px`, width: AXIS_W + RING_W }}
                >
                  Ring {ri + 1}
                </div>
                <div className="flex items-start">
                  {/* this ring's own time axis — same scale as every other ring */}
                  <div className="relative shrink-0" style={{ width: AXIS_W, height: canvasH }}>
                    {ring.map(entry => (
                      <div
                        key={entry.matchId}
                        className="absolute right-1.5 flex items-center justify-end"
                        style={{ top: yFor(entry.startMinute) + (CARD_H - 18) / 2, height: 18 }}
                      >
                        <TimeCell
                          minute={entry.startMinute}
                          onCommit={min => onScheduleChange(editMatchTime(schedule, entry.matchId, min))}
                        />
                      </div>
                    ))}
                  </div>

                  {/* this ring's matches */}
                  <div className="relative shrink-0" style={{ width: RING_W, height: canvasH }}>
                    {ring.map(entry => {
                      const match = matchById.get(entry.matchId);
                      if (!match) return null;
                      return (
                        <div
                          key={match.id}
                          className="absolute inset-x-1"
                          style={{ top: yFor(entry.startMinute), height: CARD_H }}
                        >
                          <MatchCard
                            match={match}
                            teamCount={teamCount}
                            onDrop={srcId => onScheduleChange(swapMatchIds(schedule, srcId, match.id))}
                            onChange={handleMatchChange}
                            datalistId={datalistId}
                            isValidTeamName={name => !isTeamNameTaken(matches, division, match.id, name)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
