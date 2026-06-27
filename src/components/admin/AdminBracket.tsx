"use client";

import { useEffect, useRef, useState } from "react";
import { type BracketMatch, type Division, type MatchStatus, type Team, ROUND_NAMES } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

// ── layout constants ──────────────────────────────────────────────────────────
const NATURAL_H = 800;
const ROUND_W   = 188;
const CONN_W    = 44;
const WINNER_W  = 90;
const MATCH_H   = 96;
const ROUNDS    = [1, 2, 3, 4] as const;
const NATURAL_W = ROUNDS.length * ROUND_W + (ROUNDS.length - 1) * CONN_W + WINNER_W;

// statuses that allow auto-completing via score
const AUTO_COMPLETE_FROM: MatchStatus[] = ['todo', 'next', 'active'];

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

  if (newStatus === 'completed') {
    const w = winner({ ...changed, status: 'completed' });
    if (w) {
      const winnerName  = w === 'a' ? changed.slotA.teamName : changed.slotB.teamName;
      const targetRound = changed.round + 1;
      const targetMatch = Math.ceil(changed.matchNumber / 2);
      const targetSlot  = changed.matchNumber % 2 === 1 ? 'a' : 'b';
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

// ── MatchCard ─────────────────────────────────────────────────────────────────
type MatchCardProps = {
  match: BracketMatch;
  onChange: (updated: BracketMatch) => void;
  datalistId: string;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onDragEnd: () => void;
};

function MatchCard({ match, onChange, datalistId, draggingId, onDragStart, onDrop, onDragEnd }: MatchCardProps) {
  const w = winner(match);
  const swappable = match.status === 'todo' || match.status === 'next';
  const isBeingDragged = draggingId === match.id;
  const isDropTarget   = draggingId !== null && draggingId !== match.id && swappable;

  function setScore(slot: 'a' | 'b', delta: number) {
    const updated: BracketMatch = {
      ...match,
      slotA: slot === 'a' ? { ...match.slotA, score: Math.max(0, match.slotA.score + delta) } : match.slotA,
      slotB: slot === 'b' ? { ...match.slotB, score: Math.max(0, match.slotB.score + delta) } : match.slotB,
    };
    const w2 = winner(updated);
    if (w2 && AUTO_COMPLETE_FROM.includes(updated.status)) {
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
    const s    = slot === 'a' ? match.slotA : match.slotB;
    const won  = w === slot;
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
        <button onClick={() => setScore(slot, -1)} className="shrink-0 px-0.5 text-[0.65rem] text-foreground/70 hover:text-foreground">−</button>
        <span className="shrink-0 w-3.5 text-center text-[0.65rem] tabular-nums">{s.score}</span>
        <button onClick={() => setScore(slot, 1)} className="shrink-0 px-0.5 text-[0.65rem] text-foreground/70 hover:text-foreground">+</button>
      </div>
    );
  }

  return (
    <div
      style={{ height: MATCH_H }}
      draggable={swappable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(match.id); }}
      onDragOver={e => { if (isDropTarget) e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); onDrop(match.id); }}
      onDragEnd={onDragEnd}
      className={cn(
        "flex flex-col rounded-md border bg-[#0d1018] text-foreground transition-opacity",
        STATUS_BORDER[match.status],
        isBeingDragged && "opacity-30",
        isDropTarget   && "ring-2 ring-white/60 ring-dashed",
        swappable      && "cursor-grab active:cursor-grabbing",
      )}
    >
      <SlotRow slot="a" />
      <div className="border-t border-white/[0.14]" />
      <SlotRow slot="b" />

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
          {(['todo', 'next', 'active', 'completed', 'skipped'] as MatchStatus[]).map(s => (
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
const WON_COLOR  = '#4ade80'; // green-400
const BASE_COLOR = 'rgba(255,255,255,0.85)';

function ConnectorSVG({ fromMatches }: { fromMatches: BracketMatch[] }) {
  const fromN   = fromMatches.length;
  const pairs   = fromN / 2;
  const spacing = NATURAL_H / fromN;
  const cx      = CONN_W / 2;

  return (
    <svg width={CONN_W} height={NATURAL_H} className="shrink-0 overflow-visible">
      {Array.from({ length: pairs }, (_, i) => {
        const m1       = fromMatches[2 * i];
        const m2       = fromMatches[2 * i + 1];
        const m1Done   = m1?.status === 'completed';
        const m2Done   = m2?.status === 'completed';
        const bothDone = m1Done && m2Done;
        const y1       = spacing * (2 * i + 0.5);
        const y2       = spacing * (2 * i + 1.5);
        const midY     = (y1 + y2) / 2;
        const s = (done: boolean) => done ? WON_COLOR : BASE_COLOR;
        return (
          <g key={i}>
            <line x1={0}    y1={y1}   x2={cx}     y2={y1}   stroke={s(m1Done)}   strokeWidth={1.5} />
            <line x1={cx}   y1={y1}   x2={cx}     y2={y2}   stroke={s(bothDone)} strokeWidth={1.5} />
            <line x1={0}    y1={y2}   x2={cx}     y2={y2}   stroke={s(m2Done)}   strokeWidth={1.5} />
            <line x1={cx}   y1={midY} x2={CONN_W} y2={midY} stroke={s(bothDone)} strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
  );
}

// ── RoundColumn ───────────────────────────────────────────────────────────────
type RoundColumnProps = {
  round: number;
  matches: BracketMatch[];
  onChange: (m: BracketMatch) => void;
  datalistId: string;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onDragEnd: () => void;
};

function RoundColumn({ round, matches, onChange, datalistId, draggingId, onDragStart, onDrop, onDragEnd }: RoundColumnProps) {
  return (
    <div style={{ width: ROUND_W, height: NATURAL_H }} className="flex shrink-0 flex-col justify-around">
      {matches.map(m => (
        <MatchCard
          key={m.id}
          match={m}
          onChange={onChange}
          datalistId={datalistId}
          draggingId={draggingId}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      ))}
      {matches.length === 0 && (
        <span className="text-center text-xs text-foreground">{ROUND_NAMES[round]}</span>
      )}
    </div>
  );
}

// ── AdminBracket ──────────────────────────────────────────────────────────────
type Props = {
  teams: Team[];
  matches: BracketMatch[];
  division: Division;
  onMatchesChange: (next: BracketMatch[]) => void;
};

export default function AdminBracket({ teams, matches, division, onMatchesChange }: Props) {
  const [scale, setScale]        = useState(0.7);
  const [manualScale, setManual] = useState<number | null>(null);
  const [draggingId, setDragging] = useState<string | null>(null);
  const containerRef             = useRef<HTMLDivElement>(null);
  const effectiveScale           = manualScale ?? scale;

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
    if (updated.status !== prev.status) {
      onMatchesChange(applyStatusChange(matches, updated, updated.status));
    } else {
      let next = matches.map(m => m.id === updated.id ? updated : m);
      if (winner(updated) && AUTO_COMPLETE_FROM.includes(updated.status)) {
        next = applyStatusChange(next, updated, 'completed');
      }
      onMatchesChange(next);
    }
  }

  function handleDrop(targetId: string) {
    const srcId = draggingId;
    setDragging(null);
    if (!srcId || srcId === targetId) return;
    const src = matches.find(m => m.id === srcId);
    const tgt = matches.find(m => m.id === targetId);
    if (!src || !tgt) return;
    const swappable = (m: BracketMatch) => m.status === 'todo' || m.status === 'next';
    if (!swappable(src) || !swappable(tgt)) return;
    onMatchesChange(matches.map(m => {
      if (m.id === srcId) return { ...m, slotA: { ...m.slotA, teamName: tgt.slotA.teamName }, slotB: { ...m.slotB, teamName: tgt.slotB.teamName } };
      if (m.id === targetId) return { ...m, slotA: { ...m.slotA, teamName: src.slotA.teamName }, slotB: { ...m.slotB, teamName: src.slotB.teamName } };
      return m;
    }));
  }

  function clearTeams() {
    onMatchesChange(matches.map(m =>
      m.division !== division ? m : {
        ...m,
        slotA: { teamName: '', score: 0 },
        slotB: { teamName: '', score: 0 },
      }
    ));
  }

  function autoFillTeams() {
    const divTeams  = teams.filter(t => t.division === division);
    const withScore = [...divTeams.filter(t => t.score !== null)].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    const noScore   = [...divTeams.filter(t => t.score === null)];
    // Fisher-Yates shuffle for unscored teams
    for (let i = noScore.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [noScore[i], noScore[j]] = [noScore[j], noScore[i]];
    }
    // sorted[0] = weakest (lowest score), sorted[n-1] = strongest
    const sorted = [...withScore, ...noScore];
    const n = sorted.length; // 16

    const r1 = matches
      .filter(m => m.division === division && m.round === 1)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    const numMatches = r1.length; // 8

    // Classic seeding: match8=[#1 vs #16], match7=[#2 vs #15], ..., match1=[#8 vs #9]
    // i=0→match1, i=7→match8
    // slotA: match(numMatches-i) gets sorted[i] — weakest goes to last match
    // slotB: match(numMatches-i) gets sorted[n-1-i] — strongest goes to last match
    onMatchesChange(matches.map(m => {
      if (m.division !== division || m.round !== 1) return m;
      const i = r1.findIndex(r => r.id === m.id);     // 0=match1, 7=match8
      const slotAIdx = numMatches - 1 - i;             // match1→7, match8→0
      const slotBIdx = n - 1 - (numMatches - 1 - i);  // match1→n-numMatches=8, match8→n-1=15
      return {
        ...m,
        slotA: { teamName: sorted[slotAIdx]?.name ?? '', score: 0 },
        slotB: { teamName: sorted[slotBIdx]?.name ?? '', score: 0 },
      };
    }));
  }

  const divMatches = matches.filter(m => m.division === division);
  const byRound    = ROUNDS.map(r =>
    divMatches.filter(m => m.round === r).sort((a, b) => a.matchNumber - b.matchNumber),
  );
  const finalMatch = byRound[3][0];
  const w          = finalMatch ? winner(finalMatch) : null;
  const winnerName = w === 'a' ? finalMatch?.slotA.teamName : w === 'b' ? finalMatch?.slotB.teamName : null;
  const datalistId = `bl-teams-${division}`;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-b border-white/10 px-3 py-1.5">
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
          Auto Fill Teams
        </button>
      </div>

      {/* scrollable bracket */}
      <div ref={containerRef} className="relative flex-1 overflow-auto">
        <datalist id={datalistId}>
          {teams.filter(t => t.division === division).map(t => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>

        <div style={{ width: NATURAL_W * effectiveScale, height: NATURAL_H * effectiveScale, position: 'relative' }}>
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
                  draggingId={draggingId}
                  onDragStart={setDragging}
                  onDrop={handleDrop}
                  onDragEnd={() => setDragging(null)}
                />
                {i < ROUNDS.length - 1 && <ConnectorSVG fromMatches={byRound[i]} />}
              </div>
            ))}

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
          onChange={e => setManual(Number(e.target.value))}
          className="w-28 accent-white/50"
        />
        <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground">
          {Math.round(effectiveScale * 100)}%
        </span>
      </div>
    </div>
  );
}
