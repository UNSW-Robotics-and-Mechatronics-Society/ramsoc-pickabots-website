"use client";

import { useState } from "react";
import {
  type BracketMatch, type Division, type MatchStatus, type Team, type TeamCount,
  winner, applyStatusChange, isTeamNameTaken, computeSlotDefaults,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
} from "@/lib/mock-data";
import {
  type MatchSchedule, type ConcurrentRings, type RingMatch,
  START_MINUTE,
  changeTimings, swapMatchIds, editMatchTime, rollSchedule,
  addExhibitionRing, removeExhibitionRing, addMatchToExhibitionRing,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { MATCH_DRAG_TYPE, SlotRow, TimeCell } from "./MatchTeamSlot";
import { useTeamFilter, TeamFilterBar, isMatchDimmed } from "./TeamFilterBar";
import VotingToggle from "./VotingToggle";

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
const RING_W    = 196; // ring's match-column width — card ≈ 188 (after inset), matching the bracket box
const HEADER_H  = 30;  // sticky header row height
const CARD_H    = 116; // match card height — matches the bracket box (incl. the top toggle row)
const BOX_GAP   = 12;  // vertical gap between consecutive boxes, independent of match/gap minutes

/** One ring's full column (axis + matches) — the panel should never be
 * resized narrower than this, so at least one ring is always fully visible. */
export const MIN_MATCH_LIST_W = AXIS_W + RING_W;

function matchLabel(m: BracketMatch, teamCount: TeamCount): string {
  if (m.side === 'finals-semi')  return `Finals Semi ${m.matchNumber}`;
  if (m.side === 'finals-third') return '3rd Place';
  if (m.side === 'finals-final') return 'Finals';
  if (m.side === 'exhibition')   return 'Exhibition';
  const total = m.side === 'winners' ? wbRoundsFor(teamCount) : lbRoundsFor(teamCount);
  return m.side === 'winners'
    ? wbRoundLabel(m.round, total)
    : lbRoundLabel(m.round, total);
}

// ── NumInput ──────────────────────────────────────────────────────────────────

type NumInputProps = { value: number; min?: number; max?: number; onChange: (v: number) => void };

function NumInput({ value, min = 1, max = 60, onChange }: NumInputProps) {
  const [draft, setDraft] = useState(String(value));
  // Resets the draft when `value` changes externally — adjusted during
  // render via a state (not ref) comparison, per React's documented "reset
  // state when a prop changes" pattern, rather than in an effect.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value));
  }

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
  dimmed?: boolean;
  /** Delete this match entirely — only wired up for exhibition (ad-hoc) matches. */
  onRemove?: (id: string) => void;
  /** Default placeholder text for empty slots (feeder labels, e.g. "Winner of R64 M3"). */
  defaults?: { a?: string; b?: string };
};

function MatchCard({
  match, teamCount,
  onDrop, onChange, datalistId, isValidTeamName, dimmed, onRemove, defaults,
}: MatchCardProps) {
  const [isDragging, setIsDragging]     = useState(false);
  const [dragOver,   setDragOver]       = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const w = winner(match);
  const isFinals = match.side === 'finals-semi' || match.side === 'finals-third' || match.side === 'finals-final';
  // Only ad-hoc exhibition matches are deletable — real bracket matches are
  // structural (deleting one would leave a hole in the tree); use "Skip" for those.
  const removable = match.side === 'exhibition' && !!onRemove;

  const statusClass =
    match.status === 'active'    ? 'border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.5)] bg-green-400/10' :
    match.status === 'next'      ? 'border-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.45)] bg-yellow-400/10' :
    match.status === 'completed' ? 'border-white/25 opacity-70' :
    match.status === 'skipped'   ? 'border-red-400 shadow-[0_0_10px_rgba(248,113,113,0.45)]' :
    'border-white/[0.28]';

  // Scoring only when active AND voting is closed — votes must be locked before scores change.
  const scoringAllowed = match.status === 'active' && !match.votingOpen;

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
        "group relative flex h-full cursor-grab flex-col overflow-hidden rounded-md border bg-[#0d1018] text-foreground select-none transition-all",
        statusClass,
        isDragging && 'opacity-30',
        dragOver   && 'ring-1 ring-white/50',
        dimmed     && 'opacity-30 grayscale-70',
      )}
    >
      {/* Top row — mirrors the bracket card's time row (but with no time);
          holds the remove control (left, exhibition only) and the vote toggle
          (right, active only). Always present so every card is the same height
          as the bracket boxes. */}
      <div
        className="flex shrink-0 items-center justify-between border-b border-white/[0.14] px-1.5 py-1"
        style={{ minHeight: 20 }}
        onMouseDown={e => e.stopPropagation()}
      >
        {removable ? (
          confirmRemove ? (
            <span className="flex items-center gap-1">
              <span className="text-[0.5rem] font-bold uppercase tracking-wide text-red-300">Delete?</span>
              <button
                type="button"
                onClick={() => onRemove!(match.id)}
                title="Confirm delete"
                className="flex h-4 w-4 items-center justify-center rounded bg-red-500/80 text-[0.6rem] font-bold text-white hover:bg-red-500"
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                title="Cancel"
                className="flex h-4 w-4 items-center justify-center rounded border border-white/30 text-[0.6rem] font-bold text-foreground/70 hover:bg-white/10"
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              title="Remove match"
              aria-label="Remove match"
              className="flex h-4 w-4 items-center justify-center rounded border border-red-400/40 text-[0.6rem] font-bold text-red-300 opacity-0 transition-opacity hover:bg-red-500/20 group-hover:opacity-100"
            >
              ✕
            </button>
          )
        ) : (
          <span />
        )}

        {match.status === 'active' ? (
          <VotingToggle
            open={match.votingOpen}
            onToggle={() => onChange({ ...match, votingOpen: !match.votingOpen })}
          />
        ) : (
          <span />
        )}
      </div>

      <SlotRow
        slotData={match.slotA}
        won={w === 'a'} lost={w !== null && w !== 'a'}
        datalistId={datalistId}
        isValid={isValidTeamName}
        onNameCommit={n => setName('a', n)}
        onScoreDelta={scoringAllowed ? d => setScore('a', d) : undefined}
        placeholder={defaults?.a}
      />
      <div className="border-t border-white/[0.14]" />

      <SlotRow
        slotData={match.slotB}
        won={w === 'b'} lost={w !== null && w !== 'b'}
        datalistId={datalistId}
        isValid={isValidTeamName}
        onNameCommit={n => setName('b', n)}
        onScoreDelta={scoringAllowed ? d => setScore('b', d) : undefined}
        placeholder={defaults?.b}
      />

      {/* Bottom bar — label + status + Win, mirroring the bracket card */}
      <div className="flex items-center justify-between border-t border-white/[0.14] px-1.5 py-1.5">
        <span className="w-14 shrink-0 truncate text-[0.5rem] uppercase tracking-wider text-foreground/50">
          {matchLabel(match, teamCount)}{!isFinals && `·M${match.matchNumber}`}
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
        <label className="flex w-10 items-center justify-end gap-0.5 text-[0.5rem] text-foreground/50">
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

// One-time/exhibition team — only its name matters here, for the exhibition
// match team-name autocomplete (see exhibitionDatalistId below). Duplicated
// locally rather than imported from the server-only db module.
type SpecialTeam = { id: string; name: string };

type Props = {
  matches:          BracketMatch[];
  division:         Division;
  teamCount:        TeamCount;
  schedule:         MatchSchedule;
  teams:            Team[];
  specialTeams:     SpecialTeam[];
  onScheduleChange: (s: MatchSchedule) => void;
  onMatchesChange:  (matches: BracketMatch[]) => void;
};

export default function MatchesPanel({
  matches, division, teamCount, schedule, teams, specialTeams, onScheduleChange, onMatchesChange,
}: Props) {
  const divMatches = matches.filter(m => m.division === division);
  const matchById = new Map(divMatches.map(m => [m.id, m]));
  // Feeder placeholder text for empty slots ("Winner of R64 M3", etc).
  const slotDefaults = computeSlotDefaults(matches, division, teamCount);

  // Uniform zoom for the whole list (scales rings + cards + axis together).
  // Uses CSS `zoom` (not transform) so the sticky ring headers keep working.
  const [scale, setScale] = useState(1);

  const {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  } = useTeamFilter(divMatches);

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

  // Add a blank exhibition match to a dedicated exhibition ring. It's a normal
  // exhibition match (fill in the teams, biddable when both are set) and lives
  // entirely in the exhibition ring — it never touches the bracket schedule.
  function addExhibitionMatch(exhibitionRingIndex: number) {
    // Next exhibition number for this division — derived from existing ids
    // (pure, and stable across reloads) rather than Date.now()/random.
    const usedNums = matches
      .filter(m => m.division === division && m.side === 'exhibition')
      .map(m => parseInt(m.id.split('-').pop() ?? '', 10))
      .filter(n => !Number.isNaN(n));
    const seq = (usedNums.length ? Math.max(...usedNums) : 0) + 1;
    const id = `${division}-exhibition-${seq}`;
    const newMatch: BracketMatch = {
      id,
      division,
      side: 'exhibition',
      round: 1,
      matchNumber: seq,
      slotA: { teamName: '', score: 0 },
      slotB: { teamName: '', score: 0 },
      targetScore: 2,
      status: 'active',
      votingOpen: false,
    };
    const nextMatches = [...matches, newMatch];
    onMatchesChange(nextMatches);
    onScheduleChange(rollSchedule(addMatchToExhibitionRing(schedule, exhibitionRingIndex, id), nextMatches, division));
  }

  // Fully delete an exhibition match: remove it from the bracket data; the roll
  // drops it from whichever ring it was in. (reconcile refunds any votes on it
  // when its voting row is cleaned up.)
  function handleRemoveMatch(matchId: string) {
    const nextMatches = matches.filter(m => m.id !== matchId);
    onMatchesChange(nextMatches);
    onScheduleChange(rollSchedule(schedule, nextMatches, division));
  }

  // Remove an exhibition ring and delete its matches.
  function handleRemoveExhibitionRing(index: number) {
    const removedIds = new Set((schedule.exhibitionRings?.[index] ?? []).map(e => e.matchId));
    const nextMatches = matches.filter(m => !removedIds.has(m.id));
    onMatchesChange(nextMatches);
    onScheduleChange(rollSchedule(removeExhibitionRing(schedule, index), nextMatches, division));
  }

  const datalistId = `ms-teams-${division}`;
  // Exhibition matches additionally suggest every real team from BOTH
  // divisions (not just the one currently selected) plus every special
  // (one-time) team — bracket-round matches don't get either, since those
  // are for real competitors progressing through elimination in their own
  // division, not one-off/crossover entries. Team-name inputs everywhere are
  // free text (see isValidTeamName below — it only rejects duplicate names
  // within the same division's matches, never rejects a name for belonging
  // to "the wrong" division), so this is purely a discoverability aid;
  // typing any team's name in by hand already worked.
  const exhibitionDatalistId = `ms-teams-exhibition-${division}`;

  // One shared axis: every ring uses the same start-time reference and the
  // same pixel-per-minute density, so a given clock time lines up at the
  // same row across every ring — but each ring still shows and edits its own
  // matches' times individually. The density is derived from the fixed card
  // height so a match's box always exactly fills its own slot — card size
  // never changes, only the (visible) gap after it grows/shrinks with gap time.
  const exhibitionRings = schedule.exhibitionRings ?? [];
  const allEntries = [...schedule.rings.flat(), ...exhibitionRings.flat()];
  // Show the ring area if there are any matches OR any exhibition rings (even
  // empty ones, so you can add matches to a freshly-created exhibition ring).
  const isEmpty = allEntries.length === 0 && exhibitionRings.length === 0;
  const starts = allEntries.map(e => e.startMinute);
  const globalStart = starts.length ? Math.min(...starts) : START_MINUTE;
  const globalEnd = starts.length
    ? Math.max(...starts) + schedule.matchMinutes + schedule.gapMinutes
    : globalStart + schedule.matchMinutes + schedule.gapMinutes;
  const totalMinutes = Math.max(1, globalEnd - globalStart);
  // Smaller pixel-to-time ratio than before: each slot (match + gap) occupies
  // only CARD_H + BOX_GAP px, so consecutive boxes sit close together. The box
  // itself is always drawn at CARD_H — this changes the spacing, not the size.
  const pxPerMin = (CARD_H + BOX_GAP) / (schedule.matchMinutes + schedule.gapMinutes);
  const canvasH = totalMinutes * pxPerMin;
  const yFor = (minute: number) => (minute - globalStart) * pxPerMin;

  // One ring column (used for both bracket rings and exhibition rings). Bracket
  // rings just show a label; exhibition rings also get an add-match "+" and a
  // remove-ring "✕" in the header, and a violet accent.
  function renderRingColumn(
    ring: RingMatch[],
    key: string,
    label: string,
    opts?: { onAddMatch?: () => void; onRemoveRing?: () => void; accent?: boolean },
  ) {
    return (
      <div key={key} className="flex shrink-0 flex-col border-l border-white/5">
        <div
          className={cn(
            "sticky top-0 z-10 flex items-center justify-center border bg-black/85 text-[0.8rem] font-bold uppercase tracking-widest text-white backdrop-blur-sm",
            opts?.accent ? "border-violet-400/60" : "border-white/30",
          )}
          style={{ height: HEADER_H, width: AXIS_W + RING_W }}
        >
          {label}
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {opts?.onAddMatch && (
              <button
                type="button"
                onClick={opts.onAddMatch}
                title="Add an exhibition match to this ring"
                className="flex h-5 w-5 items-center justify-center rounded border border-white/40 bg-white/10 text-sm leading-none text-white transition-colors hover:bg-white/25"
              >+</button>
            )}
            {opts?.onRemoveRing && (
              <button
                type="button"
                onClick={opts.onRemoveRing}
                title="Remove this exhibition ring"
                className="flex h-5 w-5 items-center justify-center rounded border border-red-400/40 bg-red-500/10 text-[0.7rem] leading-none text-red-300 transition-colors hover:bg-red-500/25"
              >✕</button>
            )}
          </div>
        </div>
        <div className="flex items-start pt-3">
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
                    datalistId={match.side === 'exhibition' ? exhibitionDatalistId : datalistId}
                    isValidTeamName={name => !isTeamNameTaken(matches, division, match.id, name)}
                    dimmed={isMatchDimmed(match, filterSet)}
                    onRemove={handleRemoveMatch}
                    defaults={slotDefaults.get(match.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="@container flex h-full flex-col">
      {/* Datalist for team autocomplete */}
      <datalist id={datalistId}>
        {teams.filter(t => t.division === division).map(t => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>

      {/* Exhibition matches suggest every real team from BOTH divisions
          (a crossover Standards-vs-Open exhibition is a normal thing to
          want, unlike a bracket-round match) plus every special (one-time)
          team — see exhibitionDatalistId above. */}
      <datalist id={exhibitionDatalistId}>
        {teams.map(t => (
          <option key={t.id} value={t.name} />
        ))}
        {specialTeams.map(t => (
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
              onClick={() => {
                // No-op if the ring count is unchanged (avoids reshuffling the
                // order); otherwise re-spread every match across the new ring
                // count (redistribute=true), so adding/removing a ring rebalances.
                if (n === schedule.concurrentRings) return;
                onScheduleChange(rollSchedule({ ...schedule, concurrentRings: n }, matches, division, true));
              }}
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

        {/* Add a dedicated exhibition ring (separate from the bracket rings) */}
        <button
          type="button"
          onClick={() => onScheduleChange(addExhibitionRing(schedule))}
          title="Add a dedicated exhibition ring for ad-hoc matches"
          className="ml-auto flex shrink-0 items-center gap-1 rounded border border-violet-400/50 bg-violet-400/10 px-2 py-0.5 text-[0.6rem] font-medium text-violet-200 transition-colors hover:bg-violet-400/20"
        >
          + Exhibition Ring
        </button>
      </div>

      {/* Team filter — type/pick a team to dim every other match in the list */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
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
          <div className="flex items-start" style={{ zoom: scale }}>
            {schedule.rings.map((ring, ri) => renderRingColumn(ring, `b${ri}`, `Ring ${ri + 1}`))}
            {exhibitionRings.map((ring, ei) => renderRingColumn(ring, `e${ei}`, `Exhibition ${ei + 1}`, {
              onAddMatch: () => addExhibitionMatch(ei),
              onRemoveRing: () => handleRemoveExhibitionRing(ei),
              accent: true,
            }))}
          </div>
        )}
      </div>

      {/* Uniform scale — zooms the whole list (rings + cards + axis) proportionally */}
      {!isEmpty && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-3 py-1.5">
          <span className="text-[0.55rem] text-foreground/40">Scale</span>
          <input
            type="range" min={0.5} max={2} step={0.05}
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            className="w-24 accent-white/50"
          />
          <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground/40">{Math.round(scale * 100)}%</span>
          {scale !== 1 && (
            <button onClick={() => setScale(1)} className="text-[0.55rem] text-foreground/40 hover:text-foreground/70">reset</button>
          )}
        </div>
      )}
    </div>
  );
}
