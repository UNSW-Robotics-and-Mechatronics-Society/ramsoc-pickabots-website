"use client";

import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { type Division, type Team } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { useDragPreview } from "./DragPreviewContext";

const BASE_CARD_W = 260; // grid column min-width at scale = 1

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

type SortMode   = 'points' | 'seed-desc' | 'seed-asc' | 'name';
type FilterMode = 'all' | 'present' | 'absent' | 'wildcard' | 'eliminated';

type Props = {
  teams: Team[];
  division: Division;
  eliminatedTeams: Set<string>;
  onTeamUpdate: (id: string, patch: Partial<Team>) => void;
};

export default function TeamList({ teams, division, eliminatedTeams, onTeamUpdate }: Props) {
  const [sortMode, setSortMode]     = useState<SortMode>('points');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [search, setSearch]         = useState('');
  const [compact, setCompact]       = useState(false);
  const [rawScale, setRawScale]     = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef                = useRef<HTMLDivElement>(null);
  const { setDraggedTeamName }      = useDragPreview();

  // Cap how big a column the Scale slider can request so a single card can
  // never demand more width than the panel actually has — otherwise the
  // grid would rather overflow horizontally than shrink below its minmax.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxScale = containerWidth > 0 ? clamp(containerWidth / BASE_CARD_W, 0.4, 1.6) : 1.6;
  const scale = Math.min(rawScale, maxScale);

  // derive sorted+filtered list before layout measurement
  const divTeams = teams.filter(t => t.division === division);

  const searchLower = search.toLowerCase();
  const filtered = divTeams.filter(t => {
    if (searchLower && !t.name.toLowerCase().includes(searchLower)) return false;
    const isElim    = eliminatedTeams.has(t.name);
    const isPresent = t.present ?? false;
    const isWild    = t.wildcard ?? false;
    switch (filterMode) {
      case 'present':    return isPresent && !isElim;
      case 'absent':     return !isPresent && !isElim;
      case 'wildcard':   return isWild;
      case 'eliminated': return isElim;
      default:           return true;
    }
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'seed-desc': return (b.seed ?? -Infinity) - (a.seed ?? -Infinity);
      case 'seed-asc':  return (a.seed ?? Infinity)  - (b.seed ?? Infinity);
      case 'name':      return a.name.localeCompare(b.name);
      default:          return b.points - a.points;
    }
  });

  function update(
    id: string,
    field: "seed" | "comment" | "present" | "wildcard",
    value: string | number | boolean | null,
  ) {
    onTeamUpdate(id, { [field]: value } as Partial<Team>);
  }

  // As the Scale slider shrinks cards, progressively drop detail — down to
  // just the team name at the smallest sizes — rather than squeezing every
  // control into a card too narrow to show it properly.
  const detailTier: 'full' | 'medium' | 'minimal' =
    scale >= 0.85 ? 'full' : scale >= 0.6 ? 'medium' : 'minimal';

  const SORT_OPTIONS: { label: string; value: SortMode }[] = [
    { label: 'Points', value: 'points' },
    { label: 'Seed ↓', value: 'seed-desc' },
    { label: 'Seed ↑', value: 'seed-asc' },
    { label: 'Name', value: 'name' },
  ];

  const FILTER_OPTIONS: { label: string; value: FilterMode }[] = [
    { label: 'All', value: 'all' },
    { label: 'Present', value: 'present' },
    { label: 'Absent', value: 'absent' },
    { label: 'Wildcard', value: 'wildcard' },
    { label: 'Elim.', value: 'eliminated' },
  ];

  return (
    <div className="@container flex h-full flex-col">
      {/* filter / sort toolbar */}
      <div className="shrink-0 space-y-1 border-b border-white/10 px-3 py-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teams…"
          className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground placeholder:text-foreground/30 outline-none focus:border-white/30"
        />
        {/* Options disappear right-to-left as the panel narrows, rather than
            wrapping onto a second line. */}
        <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
          <span className="w-8 shrink-0 text-[0.55rem] text-foreground/50">Sort</span>
          {SORT_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setSortMode(o.value)}
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[0.6rem] transition-colors",
                o.value === 'name'      && "@max-[260px]:hidden",
                o.value === 'seed-asc'  && "@max-[220px]:hidden",
                o.value === 'seed-desc' && "@max-[180px]:hidden",
                sortMode === o.value
                  ? "bg-white/20 text-foreground"
                  : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
          <span className="w-8 shrink-0 text-[0.55rem] text-foreground/50">Show</span>
          {FILTER_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setFilterMode(o.value)}
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[0.6rem] transition-colors",
                o.value === 'eliminated' && "@max-[320px]:hidden",
                o.value === 'wildcard'   && "@max-[280px]:hidden",
                o.value === 'absent'     && "@max-[240px]:hidden",
                o.value === 'present'    && "@max-[200px]:hidden",
                filterMode === o.value
                  ? "bg-white/20 text-foreground"
                  : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              {o.label}
            </button>
          ))}
          {/* Compact is the one control that actually helps in a narrow
              panel, so it survives longest — it only disappears once there's
              barely room for anything at all. */}
          <button
            onClick={() => setCompact(c => !c)}
            className={cn(
              "ml-auto shrink-0 rounded px-2 py-0.5 text-[0.6rem] font-medium transition-colors @max-[110px]:hidden",
              compact ? "bg-white/20 text-foreground" : "text-foreground/40 hover:text-foreground/70",
            )}
          >
            Compact
          </button>
        </div>
      </div>

      {/* scrollable team list — reflows into more columns as the panel widens;
          extra right padding keeps the scrollbar off the card content. */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto py-4 pl-4 pr-10">
        <h2 className="mb-2 truncate px-1 text-xs uppercase tracking-[0.18em] text-foreground/55 @max-[220px]:text-[0.65rem] @max-[220px]:tracking-[0.08em] @max-[160px]:text-[0.55rem] @max-[160px]:tracking-normal">
          Teams · {division} ({sorted.length}/{divTeams.length})
        </h2>

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${BASE_CARD_W * scale}px, 1fr))` }}
        >
          {sorted.map(team => {
            const isElim    = eliminatedTeams.has(team.name);
            const isPresent = team.present ?? false;
            const isWild    = team.wildcard ?? false;

            const ringClass = isWild
              ? "ring-1 ring-purple-400/70"
              : isPresent
                ? "ring-1 ring-green-400/70"
                : "ring-1 ring-red-400/50";

            const bgClass = isWild
              ? "bg-purple-400/8"
              : isPresent
                ? "bg-[#0d1018]"
                : "bg-[#0d1018]";

            return (
              <div
                key={team.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData("text/plain", team.name);
                  e.dataTransfer.effectAllowed = "copy";
                  setDraggedTeamName(team.name);
                }}
                onDragEnd={() => setDraggedTeamName(null)}
                className={cn(
                  "relative flex flex-col gap-2 rounded-2xl border border-white/22 p-3 cursor-grab active:cursor-grabbing",
                  ringClass,
                  bgClass,
                  isElim && "opacity-60",
                )}
              >
                {isElim && (
                  <span className="pointer-events-none absolute left-3 top-3 text-red-400/70 text-lg leading-none select-none">✗</span>
                )}

                {compact ? (
                  /* Compact: just name + seed (border above already shows present/absent) */
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "flex-1 truncate text-sm font-medium leading-tight",
                      isWild && "text-purple-300",
                      isElim && "text-foreground/40 line-through decoration-red-400/50",
                    )}>
                      {team.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-foreground/50">
                      Seed {team.seed ?? '—'}
                    </span>
                  </div>
                ) : detailTier === 'minimal' ? (
                  /* Scaled down far enough that only the name still fits */
                  <span className={cn(
                    "truncate text-sm font-medium leading-tight",
                    isWild && "text-purple-300",
                    isElim && "text-foreground/40 line-through decoration-red-400/50",
                  )}>
                    {team.name}
                  </span>
                ) : (
                  <>
                    {/* Row 1: name + points */}
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex-1 text-sm font-medium leading-tight",
                        isWild    && "text-purple-300",
                        isElim    && "text-foreground/40 line-through decoration-red-400/50",
                      )}>
                        {team.name}
                      </span>
                      <span className="text-xs tabular-nums text-foreground/50">
                        {team.points.toLocaleString()} pts
                      </span>
                    </div>

                    {/* Row 2: present + wildcard (+ division/call once there's room) */}
                    <div className="flex items-center gap-1.5">
                      {detailTier === 'full' && (
                        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] text-foreground/50">
                          {team.division === 'standards' ? 'STD' : 'OPEN'}
                        </span>
                      )}

                      {/* Present/Absent toggle */}
                      <label className={cn(
                        "flex cursor-pointer select-none items-center gap-1 rounded-lg border px-2 py-0.5 text-[0.65rem] transition-colors",
                        isPresent
                          ? "border-green-400/40 bg-green-400/15 text-green-300"
                          : "border-red-400/30 bg-red-400/10 text-red-300/70",
                      )}>
                        <input
                          type="checkbox"
                          checked={isPresent}
                          onChange={e => update(team.id, "present", e.target.checked)}
                          className="sr-only"
                        />
                        {isPresent ? "Present" : "Absent"}
                      </label>

                      {/* Wildcard toggle — separate from present */}
                      <button
                        type="button"
                        onClick={() => update(team.id, "wildcard", !isWild)}
                        className={cn(
                          "rounded-lg border px-2 py-0.5 text-[0.65rem] transition-colors",
                          isWild
                            ? "border-purple-400/50 bg-purple-400/20 text-purple-300"
                            : "border-white/10 bg-white/5 text-foreground/40 hover:text-foreground/70",
                        )}
                      >
                        Wildcard
                      </button>

                      {detailTier === 'full' && (
                        <button
                          type="button"
                          onClick={() => {}}
                          className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/8 px-2 py-0.5 text-[0.65rem] text-foreground/50 transition-colors hover:text-foreground/80"
                        >
                          <Phone size={10} strokeWidth={2} />
                          Call
                        </button>
                      )}
                    </div>

                    {/* Row 3: seed + notes — full detail only */}
                    {detailTier === 'full' && (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={team.seed ?? ""}
                          placeholder="Seed"
                          onChange={e => update(team.id, "seed", e.target.value === "" ? null : Number(e.target.value))}
                          className="w-20 shrink-0 rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-xs tabular-nums placeholder:text-foreground/30 outline-none focus:border-white/30"
                        />
                        <textarea
                          value={team.comment}
                          placeholder="Notes…"
                          rows={1}
                          onChange={e => update(team.id, "comment", e.target.value)}
                          className="flex-1 resize-none rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-xs placeholder:text-foreground/30 outline-none focus:border-white/30"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* scale slider — widens grid columns (fewer, larger cards) as it increases */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-3 py-1.5">
        <span className="text-[0.55rem] text-foreground/35">Scale</span>
        <input
          type="range" min={0.4} max={maxScale} step={0.05}
          value={scale}
          onChange={e => setRawScale(Number(e.target.value))}
          className="w-28 accent-white/50"
        />
        <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground/35">
          {Math.round(scale * 100)}%
        </span>
      </div>
    </div>
  );
}
