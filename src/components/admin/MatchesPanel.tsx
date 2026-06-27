"use client";

import { useState, useEffect } from "react";
import {
  type BracketMatch, type Division, type TeamCount,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
} from "@/lib/mock-data";
import {
  type MatchSchedule, type ConcurrentRings,
  formatTime, parseTimeInput,
  changeRings, changeTimings, swapMatchIds, editSlotTime,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";

const RING_OPTIONS: ConcurrentRings[] = [1, 2, 3, 4];

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
        className="w-[4.5rem] rounded bg-white/10 px-1 py-0.5 text-center text-[0.6rem] text-foreground outline-none ring-1 ring-white/30"
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

// ── NumInput — compact editable number with local draft state ────────────────

type NumInputProps = { value: number; min?: number; max?: number; onChange: (v: number) => void };

function NumInput({ value, min = 1, max = 60, onChange }: NumInputProps) {
  const [draft, setDraft] = useState(String(value));

  // Keep draft in sync if the parent changes the value externally
  useEffect(() => { setDraft(String(value)); }, [value]);

  function commit() {
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v >= min && v <= max) {
      onChange(v);
    } else {
      setDraft(String(value)); // revert to last valid
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

// ── MatchCard ─────────────────────────────────────────────────────────────────

type MatchCardProps = {
  match: BracketMatch;
  teamCount: TeamCount;
  onDrop: (srcId: string) => void;
};

function MatchCard({ match, teamCount, onDrop }: MatchCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver,   setDragOver]   = useState(false);

  const statusClass =
    match.status === 'active'    ? 'border-green-400/60 bg-green-400/10' :
    match.status === 'next'      ? 'border-yellow-400/60 bg-yellow-400/10' :
    match.status === 'completed' ? 'border-white/8 opacity-40' :
    'border-white/10 bg-white/[0.03]';

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
        "flex cursor-grab flex-col gap-1 rounded-lg border px-2 py-1.5 text-xs select-none transition-all",
        statusClass,
        isDragging && 'opacity-30',
        dragOver   && 'ring-1 ring-white/50',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[0.55rem] uppercase leading-none tracking-wider text-foreground/50">
          {matchLabel(match, teamCount)}
          {match.side !== 'grand-final' && `·M${match.matchNumber}`}
        </span>
        {(match.status === 'active' || match.status === 'next') && (
          <span className={cn(
            "shrink-0 rounded px-1 py-0.5 text-[0.5rem] font-medium uppercase leading-none tracking-wide",
            match.status === 'active'
              ? 'bg-green-400/20 text-green-300'
              : 'bg-yellow-400/20 text-yellow-300',
          )}>
            {match.status}
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        {[match.slotA, match.slotB].map((slot, i) => (
          <div key={i} className="truncate text-[0.65rem] text-foreground/70">
            {slot.teamName || <span className="italic text-foreground/30">TBD</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyCell() {
  return <div className="min-h-[3.75rem] rounded-lg border border-dashed border-white/8 bg-white/[0.015]" />;
}

// ── MatchesPanel ──────────────────────────────────────────────────────────────

type Props = {
  matches:          BracketMatch[];
  division:         Division;
  teamCount:        TeamCount;
  schedule:         MatchSchedule;
  onScheduleChange: (s: MatchSchedule) => void;
};

export default function MatchesPanel({
  matches, division, teamCount, schedule, onScheduleChange,
}: Props) {
  const matchById = new Map(
    matches.filter(m => m.division === division).map(m => [m.id, m]),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-2">
        {/* Rings toggle */}
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

        {/* Divider */}
        <div className="h-3 w-px bg-white/15" />

        {/* Match length */}
        <div className="flex items-center gap-1.5">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Match</span>
          <NumInput
            value={schedule.matchMinutes}
            onChange={v => onScheduleChange(changeTimings(schedule, v, schedule.gapMinutes))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>

        {/* Gap */}
        <div className="flex items-center gap-1.5">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Gap</span>
          <NumInput
            value={schedule.gapMinutes}
            onChange={v => onScheduleChange(changeTimings(schedule, schedule.matchMinutes, v))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>
      </div>

      {/* Schedule grid (scrolls both axes) */}
      <div className="min-h-0 flex-1 overflow-auto">
        {schedule.slots.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-foreground/30">No matches scheduled</p>
          </div>
        ) : (
          <>
            {/* Sticky column headers */}
            <div className="sticky top-0 z-10 flex border-b border-white/10 bg-black/80 backdrop-blur-sm">
              <div className="w-[4.75rem] shrink-0 border-r border-white/10 px-2 py-1.5" />
              {Array.from({ length: schedule.concurrentRings }, (_, ri) => (
                <div
                  key={ri}
                  className="w-36 shrink-0 border-r border-white/10 px-2 py-1.5 text-center text-[0.55rem] uppercase tracking-widest text-foreground/40 last:border-r-0"
                >
                  Ring {ri + 1}
                </div>
              ))}
            </div>

            {/* Slot rows */}
            <div className="divide-y divide-white/5">
              {schedule.slots.map((slot, si) => (
                <div key={slot.id} className="flex items-stretch">
                  {/* Time cell */}
                  <div className="flex w-[4.75rem] shrink-0 items-center justify-center border-r border-white/10 px-1 py-2">
                    <TimeCell
                      minute={slot.startMinute}
                      onCommit={min => onScheduleChange(editSlotTime(schedule, si, min))}
                    />
                  </div>
                  {/* Ring cells */}
                  {Array.from({ length: schedule.concurrentRings }, (_, ri) => {
                    const mid   = slot.matchIds[ri];
                    const match = mid ? matchById.get(mid) : undefined;
                    return (
                      <div key={ri} className="w-36 shrink-0 border-r border-white/5 p-1.5 last:border-r-0">
                        {match ? (
                          <MatchCard
                            match={match}
                            teamCount={teamCount}
                            onDrop={srcId => onScheduleChange(swapMatchIds(schedule, srcId, match.id))}
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
