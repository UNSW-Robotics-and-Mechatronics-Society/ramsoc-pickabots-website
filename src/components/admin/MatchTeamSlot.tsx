"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useDragPreview } from "./DragPreviewContext";

/**
 * DataTransfer type used to distinguish a match-reorder/swap drag from a
 * team-name drop (which carries `text/plain`). Shared by the bracket and
 * match-list views so a drag started in one is never misread by the other.
 */
export const MATCH_DRAG_TYPE = "application/match-id";

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
  const [previewing, setPreviewing] = useState(false);
  const committed              = useRef(value);
  const { draggedTeamName }    = useDragPreview();

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

  // While a team is being dragged over this slot, preview its name before
  // drop — dataTransfer's actual value isn't readable until the drop event,
  // so the preview comes from DragPreviewContext instead.
  const showPreview = previewing && !!draggedTeamName;
  const displayValue = showPreview ? draggedTeamName : local;

  return (
    <input
      list={datalistId}
      value={displayValue}
      placeholder="Team…"
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== committed.current) commit(local); }}
      onKeyDown={e => { if (e.key === 'Enter') commit(local); }}
      // Drop from TeamList (text/plain carries team name).
      // stopPropagation prevents the event bubbling to the card's match-swap handler.
      onDragOver={e => {
        if (!e.dataTransfer.types.includes(MATCH_DRAG_TYPE)) {
          e.preventDefault();
          e.stopPropagation();
          setPreviewing(true);
        }
      }}
      onDragLeave={() => setPreviewing(false)}
      onDrop={e => {
        setPreviewing(false);
        if (e.dataTransfer.types.includes(MATCH_DRAG_TYPE)) return; // let match-swap handle
        e.preventDefault();
        e.stopPropagation();
        const name = e.dataTransfer.getData('text/plain');
        if (name) commit(name);
      }}
      readOnly={showPreview}
      className={cn(
        "min-w-0 flex-1 bg-transparent text-[0.6rem] outline-none placeholder:text-foreground/20 truncate",
        showPreview && "italic text-foreground/50",
      )}
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
      // Accept team drops anywhere on the row, not just on the input itself.
      onDragOver={e => {
        if (!e.dataTransfer.types.includes(MATCH_DRAG_TYPE)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={e => {
        if (e.dataTransfer.types.includes(MATCH_DRAG_TYPE)) return;
        e.preventDefault();
        e.stopPropagation();
        const name = e.dataTransfer.getData('text/plain');
        if (name) onNameCommit(name);
      }}
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
