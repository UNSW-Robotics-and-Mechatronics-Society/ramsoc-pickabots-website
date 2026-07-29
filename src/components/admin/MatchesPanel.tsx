"use client";

import { useState } from "react";
import {
  type BracketMatch, type Division, type MatchStatus, type Team, type TeamCount,
  winner, applyStatusChange, isTeamSwapOnly, computeSlotDefaults,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
} from "@/lib/mock-data";
import {
  type MatchSchedule, type ExhibitionSchedule, type ConcurrentRings, type RingMatch,
  changeTimings, changeExhibitionTimings, swapMatchIds, editMatchTime, resetMatchTime, rollSchedule,
  addExhibitionRing, removeExhibitionRing, addMatchToExhibitionRing, rollExhibitionSchedule,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { MATCH_DRAG_TYPE, SlotRow, TimeCell } from "./MatchTeamSlot";
import { useTeamFilter, TeamFilterBar, isMatchDimmed } from "./TeamFilterBar";
import VotingToggle from "./VotingToggle";

const RING_OPTIONS: ConcurrentRings[] = [1, 2, 3, 4, 5, 6];
const AUTO_COMPLETE_FROM: MatchStatus[] = ['todo', 'next', 'active'];

const STATUS_LABEL: Record<MatchStatus, string> = {
  todo: 'To Do', next: 'Next', active: 'Active', completed: 'Done', skipped: 'Skip',
};
const STATUS_TEXT: Record<MatchStatus, string> = {
  todo: 'text-foreground', next: 'text-yellow-400', active: 'text-green-400',
  completed: 'text-white/50', skipped: 'text-red-400',
};

// ── layout constants ─────────────────────────────────────────────────────────
const RING_W    = 196; // ring's match-column width — card ≈ 188 (after inset), matching the bracket box
const HEADER_H  = 30;  // sticky header row height
const CARD_H    = 116; // match card height — matches the bracket box (incl. the top time row)
const BOX_GAP   = 12;  // vertical gap between consecutive boxes, independent of match/gap minutes

/** One ring's full column — the panel should never be resized narrower than
 * this, so at least one ring is always fully visible. */
export const MIN_MATCH_LIST_W = RING_W;

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
  /** This match's scheduled start, shown and edited on the card itself — see
   *  the top row below. Undefined only if the match isn't on a ring at all. */
  minute?: number;
  /** Its time was set by hand (see RingMatch.pinned). */
  pinned?: boolean;
  onTimeCommit?: (minute: number) => void;
  onTimeReset?: () => void;
};

function MatchCard({
  match, teamCount,
  onDrop, onChange, datalistId, isValidTeamName, dimmed, onRemove, defaults,
  minute, pinned, onTimeCommit, onTimeReset,
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

  // Todo/completed/skipped matches can be scored at any time. For ACTIVE and
  // NEXT matches (either can now have voting open), keep the rule: scoring
  // only once voting is closed, so votes are locked in before a score lands.
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
      {/* Top row — the same time row as the bracket card (AdminBracket's
          MatchCard), plus the remove control (left, exhibition only) and the
          vote toggle (right, active/next only). The time is absolutely centred
          rather than a third flex child: both of the other two come and go
          (the ✕ on hover, the toggle with status), and a flex layout would
          shift the time sideways as they do. */}
      <div
        className="relative flex shrink-0 items-center justify-between border-b border-white/[0.14] px-1.5 py-1"
        style={{ minHeight: 20 }}
        onMouseDown={e => e.stopPropagation()}
      >
        {minute !== undefined && onTimeCommit && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <TimeCell
              minute={minute}
              pinned={pinned}
              onCommit={onTimeCommit}
              onReset={onTimeReset}
            />
          </div>
        )}

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

        {(match.status === 'active' || match.status === 'next') ? (
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
  /** Shared across both divisions — not one copy per division. See
   * ExhibitionSchedule and MatchesMode below. */
  exhibitionSchedule: ExhibitionSchedule;
  teams:            Team[];
  specialTeams:     SpecialTeam[];
  onScheduleChange: (s: MatchSchedule) => void;
  onExhibitionScheduleChange: (s: ExhibitionSchedule) => void;
  onMatchesChange:  (matches: BracketMatch[]) => void;
};

type MatchesMode = 'bracket' | 'exhibition';

export default function MatchesPanel({
  matches, division, teamCount, schedule, exhibitionSchedule, teams, specialTeams,
  onScheduleChange, onExhibitionScheduleChange, onMatchesChange,
}: Props) {
  // Bracket-round matches and exhibition (ad-hoc) matches show in separate
  // tabs — mirrors the public voting page/match list split, so exhibition
  // matches never mix into the bracket-round view here either.
  const [mode, setMode] = useState<MatchesMode>('bracket');
  // Finished matches are hidden by default, same as the public match list — the
  // panel opens on what's still to run, and the toggle brings the day's history
  // back. Off = hidden, matching the toolbar convention that a lit control means
  // the thing it names is showing.
  const [showPrevMatches, setShowPrevMatches] = useState(false);
  // Exhibition mode shows the one shared list regardless of which division
  // is globally selected; bracket mode stays scoped to just that division.
  const divMatches = mode === 'exhibition'
    ? matches.filter(m => m.side === 'exhibition')
    : matches.filter(m => m.division === division);
  // Global (not division-scoped) so an exhibition ring can look up its cards
  // regardless of their (vestigial — see ExhibitionSchedule) division field.
  const matchById = new Map(matches.map(m => [m.id, m]));
  // Feeder placeholder text for empty slots ("Winner of R64 M3", etc) —
  // bracket-round only; exhibition matches have no feeders.
  const slotDefaults = computeSlotDefaults(matches, division, teamCount);

  // Uniform zoom for the whole list (scales rings + cards + axis together).
  // Uses CSS `zoom` (not transform) so the sticky ring headers keep working.
  const [scale, setScale] = useState(1);

  const {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  } = useTeamFilter(divMatches);

  // Bracket-round slots take any team, including one already standing elsewhere
  // in the bracket (see isTeamSwapOnly — a swap is done one slot at a time, so
  // the halfway state is always a duplicate). Exhibition matches keep their own
  // uniqueness rule: they're a single shared pool with no bracket to swap
  // within, so the same team twice is just a mistake.
  const isValidTeamName: (m: BracketMatch, name: string) => boolean = mode === 'exhibition'
    ? (m, name) =>
        !matches.some(o => o.side === 'exhibition' && o.id !== m.id && (o.slotA.teamName === name || o.slotB.teamName === name))
    : () => true;

  // Time-edit/reset/swap act on whichever schedule the active mode owns.
  const onEditTime = mode === 'exhibition'
    ? (matchId: string, minute: number) => onExhibitionScheduleChange(editMatchTime(exhibitionSchedule, matches, matchId, minute))
    : (matchId: string, minute: number) => onScheduleChange(editMatchTime(schedule, matches, matchId, minute));
  const onResetTime = mode === 'exhibition'
    ? (matchId: string) => onExhibitionScheduleChange(resetMatchTime(exhibitionSchedule, matches, matchId))
    : (matchId: string) => onScheduleChange(resetMatchTime(schedule, matches, matchId));
  const onSwap = mode === 'exhibition'
    ? (srcId: string, dstId: string) => onExhibitionScheduleChange(swapMatchIds(exhibitionSchedule, srcId, dstId))
    : (srcId: string, dstId: string) => onScheduleChange(swapMatchIds(schedule, srcId, dstId));

  // Same single path as the bracket editor's handleChange — applyStatusChange
  // against the ORIGINAL array on every edit, so advancement is both written and
  // retracted consistently (see its clearSlot) — with the same one exception: a
  // manual team swap writes only the slot it changed, leaving every already-
  // logged match downstream exactly as it was recorded (see isTeamSwapOnly).
  function handleMatchChange(updated: BracketMatch) {
    const prev = matches.find(m => m.id === updated.id);
    if (!prev) return;
    if (isTeamSwapOnly(prev, updated)) {
      onMatchesChange(matches.map(m => (m.id === updated.id ? updated : m)));
      return;
    }
    const status: MatchStatus = winner(updated) && AUTO_COMPLETE_FROM.includes(updated.status)
      ? 'completed'
      : updated.status;
    onMatchesChange(applyStatusChange(matches, updated, status, teamCount));
  }

  // Add a blank exhibition match to a dedicated exhibition ring. It's a normal
  // exhibition match (fill in the teams, biddable when both are set) and
  // lives in the single shared exhibition ring set — it never touches the
  // bracket schedule. `division` on the new match is a technical leftover
  // (the DB still requires one) with no bearing on where it shows up.
  function addExhibitionMatch(exhibitionRingIndex: number) {
    // Next exhibition number — derived from existing ids (pure, and stable
    // across reloads) rather than Date.now()/random.
    const usedNums = matches
      .filter(m => m.side === 'exhibition')
      .map(m => parseInt(m.id.split('-').pop() ?? '', 10))
      .filter(n => !Number.isNaN(n));
    const seq = (usedNums.length ? Math.max(...usedNums) : 0) + 1;
    const id = `exhibition-${seq}`;
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
    onExhibitionScheduleChange(rollExhibitionSchedule(
      addMatchToExhibitionRing(exhibitionSchedule, exhibitionRingIndex, id), nextMatches,
    ));
  }

  // Fully delete an exhibition match: remove it from the bracket data; the roll
  // drops it from whichever ring it was in. (reconcile refunds any votes on it
  // when its voting row is cleaned up.)
  function handleRemoveMatch(matchId: string) {
    const nextMatches = matches.filter(m => m.id !== matchId);
    onMatchesChange(nextMatches);
    onExhibitionScheduleChange(rollExhibitionSchedule(exhibitionSchedule, nextMatches));
  }

  // Remove an exhibition ring and delete its matches.
  function handleRemoveExhibitionRing(index: number) {
    const removedIds = new Set((exhibitionSchedule.rings[index] ?? []).map(e => e.matchId));
    const nextMatches = matches.filter(m => !removedIds.has(m.id));
    onMatchesChange(nextMatches);
    onExhibitionScheduleChange(rollExhibitionSchedule(removeExhibitionRing(exhibitionSchedule, index), nextMatches));
  }

  const datalistId = `ms-teams-${division}`;
  // Exhibition matches suggest every real team from BOTH divisions (a
  // crossover Standards-vs-Open exhibition is a normal thing to want, unlike
  // a bracket-round match) plus every special (one-time) team — bracket-round
  // matches don't get either, since those are for real competitors
  // progressing through elimination in their own division, not one-off/
  // crossover entries. Team-name inputs everywhere are free text (see
  // isValidTeamName above), so this is purely a discoverability aid; typing
  // any team's name in by hand already worked.
  const exhibitionDatalistId = "ms-teams-exhibition";

  // Matches stack directly on top of each other in each ring, every card the
  // same height with a fixed gap, and each card carries its own start time (see
  // MatchCard's top row) — there's no time axis and no time→pixel projection.
  // Rows therefore line up across rings by QUEUE POSITION rather than by clock
  // time, and the gap between two cards no longer varies with gap minutes.
  // Only the rings for the active mode are shown — bracket-round and exhibition
  // matches no longer share one combined view.
  const shownEntries = mode === 'exhibition' ? exhibitionSchedule.rings.flat() : schedule.rings.flat();
  // Show the ring area if there are any matches OR (in exhibition mode) any
  // exhibition rings at all — even empty ones, so you can add matches to a
  // freshly-created exhibition ring.
  const isEmpty = mode === 'exhibition'
    ? shownEntries.length === 0 && exhibitionSchedule.rings.length === 0
    : shownEntries.length === 0;

  // "Prev Matches" off (the default) drops finished matches from each ring.
  // 'completed' is the only status hidden: skipped matches and byes never reach
  // a ring at all (see rollSchedule's schedulable). The status read here is the
  // same one the card renders, so what's hidden always agrees with what a
  // visible card would have said. isEmpty above stays deliberately unfiltered —
  // hiding everything should leave the ring columns standing (each explaining
  // itself, see renderRingColumn) rather than blanking the whole panel.
  const isDone = (matchId: string) => matchById.get(matchId)?.status === 'completed';
  const hiddenCount = shownEntries.filter(e => isDone(e.matchId)).length;
  // Still needed by the Match/Gap inputs below (they rewrite the schedule's
  // times) — they just no longer drive any pixel geometry.
  const activeMatchMinutes = mode === 'exhibition' ? exhibitionSchedule.matchMinutes : schedule.matchMinutes;
  const activeGapMinutes   = mode === 'exhibition' ? exhibitionSchedule.gapMinutes   : schedule.gapMinutes;

  // One ring column (used for both bracket rings and exhibition rings). Bracket
  // rings just show a label; exhibition rings also get an add-match "+" and a
  // remove-ring "✕" in the header, and a violet accent.
  function renderRingColumn(
    ring: RingMatch[],
    key: string,
    label: string,
    opts?: { onAddMatch?: () => void; onRemoveRing?: () => void; accent?: boolean },
  ) {
    // Sorted by start time, then filtered — a flex column, so dropping a
    // finished match just closes the gap; nothing to compact by hand.
    const visible = [...ring]
      .sort((a, b) => a.startMinute - b.startMinute)
      .filter(e => showPrevMatches || !isDone(e.matchId));
    // Distinguish "everything here is finished and hidden" from a ring that has
    // genuinely never had matches — otherwise the toggle's effect looks like a
    // bug on a ring that's simply done for the day.
    const allHidden = visible.length === 0 && ring.length > 0;

    return (
      <div key={key} className="flex shrink-0 flex-col border-l border-white/5">
        <div
          className={cn(
            "sticky top-0 z-10 flex items-center justify-center border bg-black/85 text-[0.8rem] font-bold uppercase tracking-widest text-white backdrop-blur-sm",
            opts?.accent ? "border-violet-400/60" : "border-white/30",
          )}
          style={{ height: HEADER_H, width: RING_W }}
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
        {/* This ring's matches, stacked in start-time order. Sort and filter are
            purely presentational — every write below is keyed by match id (swap,
            time edit/reset, remove), so the stored queue order is untouched.
            Ties (which shouldn't happen within one ring) keep queue order, since
            Array#sort is stable. */}
        <div className="flex flex-col px-1 pt-3" style={{ width: RING_W, gap: BOX_GAP }}>
          {visible.map(entry => {
            const match = matchById.get(entry.matchId);
            if (!match) return null;
            return (
              <div key={match.id} className="shrink-0" style={{ height: CARD_H }}>
                <MatchCard
                  match={match}
                  teamCount={teamCount}
                  onDrop={srcId => onSwap(srcId, match.id)}
                  onChange={handleMatchChange}
                  datalistId={match.side === 'exhibition' ? exhibitionDatalistId : datalistId}
                  isValidTeamName={name => isValidTeamName(match, name)}
                  dimmed={isMatchDimmed(match, filterSet)}
                  onRemove={handleRemoveMatch}
                  defaults={slotDefaults.get(match.id)}
                  minute={entry.startMinute}
                  pinned={entry.pinned}
                  onTimeCommit={min => onEditTime(entry.matchId, min)}
                  onTimeReset={() => onResetTime(entry.matchId)}
                />
              </div>
            );
          })}

          {/* A stacked column collapses to nothing when empty — without this a
              freshly added exhibition ring would show a bare header with no
              indication that its "+" is what fills it, and a ring whose matches
              are all finished would look broken rather than done. */}
          {visible.length === 0 && (
            <div
              className="flex items-center justify-center px-2 text-center rounded-md border border-dashed border-white/15 text-[0.55rem] text-foreground/30"
              style={{ height: CARD_H }}
            >
              {allHidden
                ? `All ${ring.length} done — show Prev Matches`
                : opts?.onAddMatch ? 'No matches — use + above' : 'No matches'}
            </div>
          )}
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
          {(['bracket', 'exhibition'] as MatchesMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide transition-colors",
                mode === m ? "bg-white/20 text-foreground" : "text-foreground/40 hover:text-foreground/70",
              )}
            >
              {m === 'bracket' ? 'Bracket Matches' : 'Exhibition Matches'}
            </button>
          ))}
        </div>

        {/* Prev Matches — sits next to the mode tabs but is a filter, not a
            third mode, so the divider keeps it separate. Never collapses at
            narrow widths (unlike Match/Gap below): with finished matches hidden
            by default, the control that explains why has to stay reachable.
            The count is what makes the default state legible — otherwise a list
            that opens with the morning's matches already dropped just looks short. */}
        <div className="h-3 w-px shrink-0 bg-white/15" />
        <button
          type="button"
          onClick={() => setShowPrevMatches(v => !v)}
          aria-pressed={showPrevMatches}
          title={showPrevMatches
            ? 'Hide matches that have already finished'
            : 'Show matches that have already finished'}
          className={cn(
            "shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide transition-colors",
            showPrevMatches ? "bg-white/20 text-foreground" : "text-foreground/40 hover:text-foreground/70",
          )}
        >
          Prev Matches{!showPrevMatches && hiddenCount > 0 ? ` (${hiddenCount})` : ''}
        </button>

        {/* Ring count only means anything for bracket rings — exhibition ring
            count is managed directly via the +/✕ controls on each ring. */}
        {mode === 'bracket' && (
          <>
            <div className="h-3 w-px shrink-0 bg-white/15" />
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
          </>
        )}

        <div className="h-3 w-px shrink-0 bg-white/15 @max-[180px]:hidden" />

        {/* Match/Gap apply globally to every not-yet-completed match across
            all rings for the active mode (changeTimings/changeExhibitionTimings
            freeze completed matches' times). They only move the times shown on
            the cards — the stacked layout's spacing is fixed either way. */}
        <div className="flex shrink-0 items-center gap-1.5 @max-[180px]:hidden">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Match</span>
          <NumInput
            value={activeMatchMinutes}
            onChange={v => mode === 'exhibition'
              ? onExhibitionScheduleChange(changeExhibitionTimings(exhibitionSchedule, matches, v, activeGapMinutes))
              : onScheduleChange(changeTimings(schedule, matches, v, activeGapMinutes))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 @max-[260px]:hidden">
          <span className="text-[0.55rem] uppercase tracking-widest text-foreground/40">Gap</span>
          <NumInput
            value={activeGapMinutes}
            onChange={v => mode === 'exhibition'
              ? onExhibitionScheduleChange(changeExhibitionTimings(exhibitionSchedule, matches, activeMatchMinutes, v))
              : onScheduleChange(changeTimings(schedule, matches, activeMatchMinutes, v))}
          />
          <span className="text-[0.55rem] text-foreground/30">min</span>
        </div>

        {/* Add a dedicated exhibition ring (separate from the bracket rings) —
            only relevant while looking at the exhibition tab. */}
        {mode === 'exhibition' && (
          <button
            type="button"
            onClick={() => onExhibitionScheduleChange(addExhibitionRing(exhibitionSchedule))}
            title="Add a dedicated exhibition ring for ad-hoc matches"
            className="ml-auto flex shrink-0 items-center gap-1 rounded border border-violet-400/50 bg-violet-400/10 px-2 py-0.5 text-[0.6rem] font-medium text-violet-200 transition-colors hover:bg-violet-400/20"
          >
            + Exhibition Ring
          </button>
        )}
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

      {/* Match list — one shared scale, one scroll; each ring is its own stacked
          column and every match's time is still edited individually, on its own
          card. Extra right padding keeps the scrollbar off the match cards. */}
      <div className="min-h-0 flex-1 overflow-auto pr-10">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-foreground/30">No matches scheduled</p>
          </div>
        ) : (
          <div className="flex items-start" style={{ zoom: scale }}>
            {mode === 'bracket'
              ? schedule.rings.map((ring, ri) => renderRingColumn(ring, `b${ri}`, `Ring ${ri + 1}`))
              : exhibitionSchedule.rings.map((ring, ei) => renderRingColumn(ring, `e${ei}`, `Exhibition ${ei + 1}`, {
                  onAddMatch: () => addExhibitionMatch(ei),
                  onRemoveRing: () => handleRemoveExhibitionRing(ei),
                  accent: true,
                }))}
          </div>
        )}
      </div>

      {/* Uniform scale — zooms the whole list (rings + cards) proportionally */}
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
