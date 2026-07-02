"use client";

import { useState, useEffect, useRef } from "react";
import {
  type BracketMatch, type Division, type MatchStatus, type Team, type TeamCount,
  winner, applyStatusChange,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
} from "@/lib/mock-data";
import {
  type MatchSchedule, type ConcurrentRings,
  formatTime, parseTimeInput,
  changeRings, changeTimings, swapMatchIds, editSlotTime,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";

const RING_OPTIONS: ConcurrentRings[] = [1, 2, 3, 4];
const AUTO_COMPLETE_FROM: MatchStatus[] = ['todo', 'next', 'active'];

const STATUS_LABEL: Record<MatchStatus, string> = {
  todo: 'To Do', next: 'Next', active: 'Active', completed: 'Done', skipped: 'Skip',
};
const STATUS_TEXT: Record<MatchStatus, string> = {
  todo: 'text-foreground', next: 'text-yellow-400', active: 'text-green-400',
  completed: 'text-white/50', skipped: 'text-red-400',
};

function matchLabel(m: BracketMatch, teamCount: TeamCount): string {
  if (m.side === 'grand-final') return 'Grand Final';
  const total = m.side === 'winners' ? wbRoundsFor(teamCount) : lbRoundsFor(teamCount);
  return m.side === 'winners'
    ? wbRoundLabel(m.round, total)
    : lbRoundLabel(m.round, total);
}

// ── TimeCell ──────────────────────────────────────────────────────────────────

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
        className="w-18 rounded bg-white/10 px-1 py-0.5 text-center text-[0.6rem] text-foreground outline-none ring-1 ring-white/30"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Click to edit time"
      className="text-[0.6rem] tabular-nums text-foreground/50 transition-colors hover:text-foreground/80"
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

// ── MatchTeamInput ────────────────────────────────────────────────────────────

function MatchTeamInput({
  value, datalistId, onCommit, isValid,
}: {
  value: string;
  datalistId: string;
  onCommit: (v: string) => void;
  isValid?: (v: string) => boolean;
}) {
  const [local, setLocal] = useState(value);
  const committed         = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      setLocal(value);
      committed.current = value;
    }
  }, [value]);

  function commit(v: string) {
    if (isValid && v && !isValid(v)) {
      // Reject: revert to the current accepted value
      setLocal(value);
      committed.current = value;
      return;
    }
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
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('application/schedule-match')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={e => {
        if (e.dataTransfer.types.includes('application/schedule-match')) return;
        e.preventDefault();
        e.stopPropagation();
        const name = e.dataTransfer.getData('text/plain');
        if (name) commit(name);
      }}
      className="min-w-0 flex-1 bg-transparent text-[0.6rem] outline-none placeholder:text-foreground/20 truncate"
    />
  );
}

// ── SlotRow ───────────────────────────────────────────────────────────────────

type SlotRowProps = {
  slotData: { teamName: string; score: number };
  won: boolean;
  lost: boolean;
  datalistId: string;
  isValid?: (v: string) => boolean;
  onNameCommit: (n: string) => void;
  onScoreDelta: (d: number) => void;
};

function SlotRow({ slotData, won, lost, datalistId, isValid, onNameCommit, onScoreDelta }: SlotRowProps) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-0.5 px-1.5 py-0.5",
        won  && "rounded bg-amber-400/20",
        lost && "opacity-40",
      )}
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('application/schedule-match')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={e => {
        if (e.dataTransfer.types.includes('application/schedule-match')) return;
        e.preventDefault();
        e.stopPropagation();
        const name = e.dataTransfer.getData('text/plain');
        if (name) onNameCommit(name);
      }}
    >
      <MatchTeamInput
        value={slotData.teamName}
        datalistId={datalistId}
        onCommit={onNameCommit}
        isValid={isValid}
      />
      {won  && <span className="shrink-0 text-amber-300 text-[0.55rem]">★</span>}
      {lost && <span className="shrink-0 text-red-400/70 text-[0.55rem]">✗</span>}
      <button
        onClick={e => { e.stopPropagation(); onScoreDelta(-1); }}
        className="shrink-0 px-0.5 text-[0.65rem] text-foreground/70 hover:text-foreground"
      >−</button>
      <span className="shrink-0 w-3.5 text-center text-[0.65rem] tabular-nums">{slotData.score}</span>
      <button
        onClick={e => { e.stopPropagation(); onScoreDelta(1); }}
        className="shrink-0 px-0.5 text-[0.65rem] text-foreground/70 hover:text-foreground"
      >+</button>
    </div>
  );
}

// ── MatchCard ─────────────────────────────────────────────────────────────────

type MatchCardProps = {
  match: BracketMatch;
  teamCount: TeamCount;
  onDrop: (srcId: string) => void;
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  isValidTeamName: (name: string) => boolean;
};

function MatchCard({ match, teamCount, onDrop, onChange, datalistId, isValidTeamName }: MatchCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver,   setDragOver]   = useState(false);

  const w = winner(match);

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
        e.dataTransfer.setData('application/schedule-match', match.id);
        e.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const src = e.dataTransfer.getData('application/schedule-match');
        if (src && src !== match.id) onDrop(src);
      }}
      className={cn(
        "flex cursor-grab flex-col rounded-md border bg-[#0d1018] text-foreground select-none transition-all",
        statusClass,
        isDragging && 'opacity-30',
        dragOver   && 'ring-1 ring-white/50',
      )}
    >
      {/* Header: label + status */}
      <div className="flex items-center justify-between gap-1 px-1.5 pt-1 pb-0.5">
        <span className="truncate text-[0.55rem] uppercase leading-none tracking-wider text-foreground/50">
          {matchLabel(match, teamCount)}
          {match.side !== 'grand-final' && `·M${match.matchNumber}`}
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

      {/* Slot A */}
      <SlotRow
        slotData={match.slotA}
        won={w === 'a'} lost={w !== null && w !== 'a'}
        datalistId={datalistId}
        isValid={isValidTeamName}
        onNameCommit={n => setName('a', n)}
        onScoreDelta={d => setScore('a', d)}
      />
      <div className="border-t border-white/[0.14]" />

      {/* Slot B */}
      <SlotRow
        slotData={match.slotB}
        won={w === 'b'} lost={w !== null && w !== 'b'}
        datalistId={datalistId}
        isValid={isValidTeamName}
        onNameCommit={n => setName('b', n)}
        onScoreDelta={d => setScore('b', d)}
      />

      {/* Footer: target score */}
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

function EmptyCell() {
  return <div className="min-h-22 rounded-lg border border-dashed border-white/8 bg-white/1.5" />;
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

  function isValidTeamName(matchId: string, name: string): boolean {
    return !matches.some(m =>
      m.id !== matchId &&
      m.division === division &&
      (m.slotA.teamName === name || m.slotB.teamName === name),
    );
  }

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

  return (
    <div className="flex h-full flex-col">
      {/* Datalist for team autocomplete */}
      <datalist id={datalistId}>
        {teams.filter(t => t.division === division).map(t => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="mr-0.5 text-[0.55rem] uppercase tracking-widest text-foreground/40">Rings</span>
          {RING_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => onScheduleChange(changeRings(schedule, n))}
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

        <div className="h-3 w-px bg-white/15" />

        <div className="flex items-center gap-1.5">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Match</span>
          <NumInput
            value={schedule.matchMinutes}
            onChange={v => onScheduleChange(changeTimings(schedule, v, schedule.gapMinutes))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Gap</span>
          <NumInput
            value={schedule.gapMinutes}
            onChange={v => onScheduleChange(changeTimings(schedule, schedule.matchMinutes, v))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>
      </div>

      {/* Schedule grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        {schedule.slots.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-foreground/30">No matches scheduled</p>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 flex border-b border-white/10 bg-black/80 backdrop-blur-sm">
              <div className="w-19 shrink-0 border-r border-white/10 px-2 py-1.5" />
              {Array.from({ length: schedule.concurrentRings }, (_, ri) => (
                <div
                  key={ri}
                  className="w-44 shrink-0 border-r border-white/10 px-2 py-1.5 text-center text-[0.55rem] uppercase tracking-widest text-foreground/40 last:border-r-0"
                >
                  Ring {ri + 1}
                </div>
              ))}
            </div>

            <div className="divide-y divide-white/5">
              {schedule.slots.map((slot, si) => (
                <div key={slot.id} className="flex items-stretch">
                  <div className="flex w-19 shrink-0 items-center justify-center border-r border-white/10 px-1 py-2">
                    <TimeCell
                      minute={slot.startMinute}
                      onCommit={min => onScheduleChange(editSlotTime(schedule, si, min))}
                    />
                  </div>
                  {Array.from({ length: schedule.concurrentRings }, (_, ri) => {
                    const mid   = slot.matchIds[ri];
                    const match = mid ? matchById.get(mid) : undefined;
                    return (
                      <div key={ri} className="w-44 shrink-0 border-r border-white/5 p-1.5 last:border-r-0">
                        {match ? (
                          <MatchCard
                            match={match}
                            teamCount={teamCount}
                            onDrop={srcId => onScheduleChange(swapMatchIds(schedule, srcId, match.id))}
                            onChange={handleMatchChange}
                            datalistId={datalistId}
                            isValidTeamName={name => isValidTeamName(match.id, name)}
                          />
                        ) : (
                          <EmptyCell />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
