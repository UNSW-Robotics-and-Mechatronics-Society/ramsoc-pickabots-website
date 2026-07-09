"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatTime, parseTimeInput } from "@/lib/schedule";

/**
 * DataTransfer type carried by a match-reorder/swap drag, shared by the
 * bracket and match-list views.
 */
export const MATCH_DRAG_TYPE = "application/match-id";

// ── TimeCell — click a match's scheduled time to edit it inline ───────────────
// Shared by MatchesPanel (axis labels) and AdminBracket (on each card) so
// editing a time behaves identically — same click-to-edit affordance, same
// "1:05pm"/"13:05" parsing — no matter which admin view it's edited from.
export type TimeCellProps = { minute: number; onCommit: (minute: number) => void; className?: string };

export function TimeCell({ minute, onCommit, className }: TimeCellProps) {
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
        onMouseDown={e => e.stopPropagation()}
        className={cn("w-14 rounded bg-white/10 px-1 py-0.5 text-center text-[0.55rem] text-foreground outline-none ring-1 ring-white/30", className)}
      />
    );
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); startEdit(); }}
      onMouseDown={e => e.stopPropagation()}
      title="Click to edit this match's time"
      className={cn("text-[0.55rem] tabular-nums text-foreground/50 transition-colors hover:text-foreground/80", className)}
    >
      {formatTime(minute)}
    </button>
  );
}

// Single implementation of the team-name input used by both AdminBracket and
// MatchesPanel — previously each view had its own copy with subtly different
// commit/validation behavior, which let a drop be accepted in one view and
// silently reverted in the other.
export function MatchTeamInput({
  value, datalistId, onCommit, isValid,
}: {
  value: string;
  datalistId: string;
  onCommit: (v: string) => void;
  isValid?: (v: string) => boolean;
}) {
  const [local, setLocal]     = useState(value);
  const committed              = useRef(value);

  // Sync when prop changes externally (winner advancement, clear, auto-fill)
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
      className="min-w-0 flex-1 bg-transparent text-[0.6rem] outline-none placeholder:text-foreground/20 truncate"
    />
  );
}

export type SlotRowProps = {
  slotData: { teamName: string; score: number };
  won: boolean;
  lost: boolean;
  datalistId: string;
  isValid?: (v: string) => boolean;
  onNameCommit: (n: string) => void;
  onScoreDelta: (d: number) => void;
};

// Defined as a stable, named component (not inline) so React never remounts
// it — an inline component here previously caused the input to lose focus
// after every keystroke.
export function SlotRow({ slotData, won, lost, datalistId, isValid, onNameCommit, onScoreDelta }: SlotRowProps) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-0.5 px-1.5",
        won  && "rounded bg-amber-400/20",
        lost && "opacity-40",
      )}
    >
      <MatchTeamInput value={slotData.teamName} datalistId={datalistId} onCommit={onNameCommit} isValid={isValid} />
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
