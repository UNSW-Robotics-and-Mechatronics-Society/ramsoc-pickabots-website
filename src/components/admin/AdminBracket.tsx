"use client";

import { useEffect, useRef, useState } from "react";
import { type BracketMatch, type Division, type MatchStatus, type Team, ROUND_NAMES } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

// ── layout constants ──────────────────────────────────────────────────────────
const NATURAL_H = 800;   // total bracket height (px)
const ROUND_W   = 188;   // each round column width
const CONN_W    = 44;    // connector SVG width
const WINNER_W  = 90;    // winner label column
const MATCH_H   = 96;    // each match card height (must be < NATURAL_H/8 = 100)
const ROUNDS    = [1, 2, 3, 4] as const;
const NATURAL_W = ROUNDS.length * ROUND_W + (ROUNDS.length - 1) * CONN_W + WINNER_W; // 960

// ── helpers ───────────────────────────────────────────────────────────────────
function winner(m: BracketMatch): 'a' | 'b' | null {
  if (m.slotA.score >= m.targetScore && m.slotA.teamName) return 'a';
  if (m.slotB.score >= m.targetScore && m.slotB.teamName) return 'b';
  return null;
}

function sortedByRound(matches: BracketMatch[], division: Division) {
  return [...matches]
    .filter(m => m.division === division)
    .sort((a, b) => a.round !== b.round ? a.round - b.round : a.matchNumber - b.matchNumber);
}

function applyStatusChange(
  all: BracketMatch[],
  changed: BracketMatch,
  newStatus: MatchStatus,
): BracketMatch[] {
  let next = all.map(m => m.id === changed.id ? { ...changed, status: newStatus } : m);

  // auto-advance winner into next round slot
  if (newStatus === 'completed') {
    const w = winner({ ...changed, status: 'completed' });
    if (w) {
      const winnerName = w === 'a' ? changed.slotA.teamName : changed.slotB.teamName;
      const targetRound  = changed.round + 1;
      const targetMatch  = Math.ceil(changed.matchNumber / 2);
      const targetSlot   = changed.matchNumber % 2 === 1 ? 'a' : 'b';
      next = next.map(m => {
        if (m.division === changed.division && m.round === targetRound && m.matchNumber === targetMatch) {
          return targetSlot === 'a'
            ? { ...m, slotA: { ...m.slotA, teamName: winnerName } }
            : { ...m, slotB: { ...m.slotB, teamName: winnerName } };
        }
        return m;
      });
    }
  }

  // promote next → active, todo → next
  if (newStatus === 'completed' || newStatus === 'skipped') {
    const seq = sortedByRound(next, changed.division);
    const idx = seq.findIndex(m => m.id === changed.id);
    const promote  = seq[idx + 1];
    const upcoming = seq[idx + 2];
    next = next.map(m => {
      if (promote  && m.id === promote.id  && (m.status === 'next' || m.status === 'todo')) return { ...m, status: 'active' };
      if (upcoming && m.id === upcoming.id && m.status === 'todo') return { ...m, status: 'next' };
      return m;
    });
  }

  return next;
}

// ── status styling ────────────────────────────────────────────────────────────
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

// ── MatchCard ────────────────────────────────────────────────────────────────
type MatchCardProps = {
  match: BracketMatch;
  onChange: (updated: BracketMatch) => void;
  datalistId: string;
};

function MatchCard({ match, onChange, datalistId }: MatchCardProps) {
  const w = winner(match);

  function setScore(slot: 'a' | 'b', delta: number) {
    const updated: BracketMatch = {
      ...match,
      slotA: slot === 'a' ? { ...match.slotA, score: Math.max(0, match.slotA.score + delta) } : match.slotA,
      slotB: slot === 'b' ? { ...match.slotB, score: Math.max(0, match.slotB.score + delta) } : match.slotB,
    };
    // auto-complete when score hits target
    const w2 = winner(updated);
    if (w2 && updated.status === 'active') {
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

  function SlotRow({ slot }: { slot: 'a' | 'b' }) {
    const s   = slot === 'a' ? match.slotA : match.slotB;
    const won = w === slot;
    const lost = w !== null && w !== slot;
    return (
      <div className={cn(
        "flex flex-1 items-center gap-0.5 px-1.5",
        won  && "rounded bg-amber-400/20",
        lost && "opacity-40",
      )}>
        <input
          list={datalistId}
          value={s.teamName}
          placeholder="Team…"
          onChange={e => setName(slot, e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[0.6rem] outline-none placeholder:text-foreground/20 truncate"
        />
        {won  && <span className="shrink-0 text-amber-300 text-[0.55rem]">★</span>}
        {lost && <span className="shrink-0 text-red-400/70 text-[0.55rem]">✗</span>}
        <button onClick={() => setScore(slot, -1)} className="shrink-0 text-[0.65rem] text-foreground/70 hover:text-foreground px-0.5">−</button>
        <span className="shrink-0 w-3.5 text-center text-[0.65rem] tabular-nums">{s.score}</span>
        <button onClick={() => setScore(slot, 1)} className="shrink-0 text-[0.65rem] text-foreground/70 hover:text-foreground px-0.5">+</button>
      </div>
    );
  }

  return (
    <div
      style={{ height: MATCH_H }}
      className={cn(
        "flex flex-col rounded-md border bg-[#0d1018] text-foreground",
        STATUS_BORDER[match.status],
      )}
    >
      <SlotRow slot="a" />
      <div className="border-t border-white/[0.14]" />
      <SlotRow slot="b" />

      {/* footer — status in centre, id left, win-target right */}
      <div className="flex items-center justify-between border-t border-white/[0.14] px-1.5 py-1.5">
        <span className="w-10 text-[0.5rem] text-foreground">R{match.round}·M{match.matchNumber}</span>
        <select
          value={match.status}
          onChange={e => onChange({ ...match, status: e.target.value as MatchStatus })}
          className={cn(
            "cursor-pointer rounded border border-white/30 bg-black/60 px-1 py-0.5 text-[0.6rem] font-medium outline-none",
            STATUS_TEXT[match.status],
          )}
        >
          {(['todo','next','active','completed','skipped'] as MatchStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <label className="flex w-10 items-center justify-end gap-0.5 text-[0.5rem] text-foreground">
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

// ── ConnectorSVG ──────────────────────────────────────────────────────────────
function ConnectorSVG({ fromN }: { fromN: number }) {
  const pairs   = fromN / 2;
  const spacing = NATURAL_H / fromN;
  const cx      = CONN_W / 2;
  const stroke  = "rgba(255,255,255,0.85)";

  return (
    <svg width={CONN_W} height={NATURAL_H} className="shrink-0 overflow-visible">
      {Array.from({ length: pairs }, (_, i) => {
        const y1   = spacing * (2 * i + 0.5);
        const y2   = spacing * (2 * i + 1.5);
        const midY = (y1 + y2) / 2;
        return (
          <g key={i}>
            <line x1={0}    y1={y1}   x2={cx}     y2={y1}   stroke={stroke} strokeWidth={1.5} />
            <line x1={cx}   y1={y1}   x2={cx}     y2={y2}   stroke={stroke} strokeWidth={1.5} />
            <line x1={0}    y1={y2}   x2={cx}     y2={y2}   stroke={stroke} strokeWidth={1.5} />
            <line x1={cx}   y1={midY} x2={CONN_W} y2={midY} stroke={stroke} strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
  );
}

// ── RoundColumn ───────────────────────────────────────────────────────────────
function RoundColumn({ round, matches, onChange, datalistId }: {
  round: number;
  matches: BracketMatch[];
  onChange: (m: BracketMatch) => void;
  datalistId: string;
}) {
  return (
    <div style={{ width: ROUND_W, height: NATURAL_H }} className="flex shrink-0 flex-col justify-around">
      {matches.map(m => (
        <MatchCard key={m.id} match={m} onChange={onChange} datalistId={datalistId} />
      ))}
      {matches.length === 0 && (
        <span className="text-center text-xs text-foreground">{ROUND_NAMES[round]}</span>
      )}
    </div>
  );
}

// ── AdminBracket (main) ───────────────────────────────────────────────────────
type Props = {
  teams: Team[];
  matches: BracketMatch[];
  division: Division;
  onMatchesChange: (next: BracketMatch[]) => void;
};

export default function AdminBracket({ teams, matches, division, onMatchesChange }: Props) {
  const [scale, setScale]         = useState(0.7);
  const [manualScale, setManual]  = useState<number | null>(null);
  const containerRef              = useRef<HTMLDivElement>(null);
  const effectiveScale            = manualScale ?? scale;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const auto = Math.min(1.4, Math.max(0.25, entry.contentRect.width / NATURAL_W));
      setScale(auto);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function handleChange(updated: BracketMatch) {
    const prev = matches.find(m => m.id === updated.id);
    if (!prev) return;
    // If status changed, run progression logic
    if (updated.status !== prev.status) {
      onMatchesChange(applyStatusChange(matches, updated, updated.status));
    } else {
      // score/name/targetScore change → check auto-complete
      let next = matches.map(m => m.id === updated.id ? updated : m);
      if (updated.status === 'active' && winner(updated)) {
        next = applyStatusChange(next, updated, 'completed');
      }
      onMatchesChange(next);
    }
  }

  const divMatches = matches.filter(m => m.division === division);
  const byRound    = ROUNDS.map(r =>
    divMatches.filter(m => m.round === r).sort((a, b) => a.matchNumber - b.matchNumber),
  );
  const finalMatch  = byRound[3][0];
  const w           = finalMatch ? winner(finalMatch) : null;
  const winnerName  = w === 'a' ? finalMatch?.slotA.teamName : w === 'b' ? finalMatch?.slotB.teamName : null;
  const datalistId  = `bl-teams-${division}`;

  return (
    <div className="flex h-full flex-col">
      {/* scrollable bracket area */}
      <div ref={containerRef} className="relative flex-1 overflow-auto">
        {/* datalist for autofill */}
        <datalist id={datalistId}>
          {teams.filter(t => t.division === division).map(t => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>

        {/* outer div sets scrollable area size */}
        <div style={{ width: NATURAL_W * effectiveScale, height: NATURAL_H * effectiveScale, position: 'relative' }}>
          {/* inner div is the natural-size bracket, scaled via transform */}
          <div
            style={{ width: NATURAL_W, height: NATURAL_H, transform: `scale(${effectiveScale})`, transformOrigin: 'top left', position: 'absolute' }}
            className="flex items-stretch"
          >
            {ROUNDS.map((round, i) => (
              <div key={round} className="flex items-stretch">
                <RoundColumn
                  round={round}
                  matches={byRound[i]}
                  onChange={handleChange}
                  datalistId={datalistId}
                />
                {i < ROUNDS.length - 1 && <ConnectorSVG fromN={byRound[i].length || 1} />}
              </div>
            ))}

            {/* Winner */}
            <div style={{ width: WINNER_W }} className="flex shrink-0 flex-col items-center justify-center">
              <span className="text-[0.55rem] uppercase tracking-widest text-foreground">Winner</span>
              {winnerName && (
                <span className="mt-1 text-center text-xs font-semibold text-amber-300">{winnerName}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* scale slider */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-3 py-1.5">
        <span className="text-[0.55rem] text-foreground">Scale</span>
        <input
          type="range" min={0.25} max={1.4} step={0.05}
          value={effectiveScale}
          onChange={e => { setManual(Number(e.target.value)); }}
          className="w-28 accent-white/50"
        />
        <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground">
          {Math.round(effectiveScale * 100)}%
        </span>
      </div>
    </div>
  );
}
