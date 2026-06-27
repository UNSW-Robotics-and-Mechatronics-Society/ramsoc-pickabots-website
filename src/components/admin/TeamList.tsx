"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { type Division, type Team } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

const NATURAL_W = 340;

type SortMode   = 'points' | 'score-desc' | 'score-asc' | 'name';
type FilterMode = 'all' | 'present' | 'absent' | 'wildcard' | 'eliminated';

type Props = {
  teams: Team[];
  division: Division;
  eliminatedTeams: Set<string>;
};

export default function TeamList({ teams: initialTeams, division, eliminatedTeams }: Props) {
  const [teams, setTeams]           = useState<Team[]>(initialTeams);
  const [present, setPresent]       = useState<Record<string, boolean>>({});
  const [wildcard, setWildcard]     = useState<Record<string, boolean>>({});
  const [sortMode, setSortMode]     = useState<SortMode>('points');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [autoScale, setAutoScale]   = useState(1);
  const [manualScale, setManual]    = useState<number | null>(null);
  const [naturalH, setNaturalH]     = useState(800);
  const containerRef                = useRef<HTMLDivElement>(null);
  const innerRef                    = useRef<HTMLDivElement>(null);
  const saveTimers                  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const effectiveScale = manualScale ?? autoScale;

  useEffect(() => { setTeams(initialTeams); }, [initialTeams]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setAutoScale(Math.min(1.6, Math.max(0.4, entry.contentRect.width / NATURAL_W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // derive sorted+filtered list before layout measurement
  const divTeams = teams.filter(t => t.division === division);

  const filtered = divTeams.filter(t => {
    const isElim    = eliminatedTeams.has(t.name);
    const isPresent = present[t.id] ?? false;
    const isWild    = wildcard[t.id] ?? false;
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
      case 'score-desc': return (b.score ?? -Infinity) - (a.score ?? -Infinity);
      case 'score-asc':  return (a.score ?? Infinity)  - (b.score ?? Infinity);
      case 'name':       return a.name.localeCompare(b.name);
      default:           return b.points - a.points;
    }
  });

  useLayoutEffect(() => {
    if (innerRef.current) setNaturalH(innerRef.current.offsetHeight);
  }, [sorted.length]);

  function debounce(id: string, fn: () => void) {
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(fn, 300);
  }

  function update(id: string, field: "score" | "comment" | "division", value: string | number | null) {
    setTeams(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
    debounce(`${id}-${field}`, () => { console.log("[admin] save", { id, field, value }); });
  }

  const SORT_OPTIONS: { label: string; value: SortMode }[] = [
    { label: 'Points', value: 'points' },
    { label: 'Score ↓', value: 'score-desc' },
    { label: 'Score ↑', value: 'score-asc' },
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
    <div className="flex h-full flex-col">
      {/* filter / sort toolbar */}
      <div className="shrink-0 space-y-1 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1">
          <span className="w-8 shrink-0 text-[0.55rem] text-foreground/50">Sort</span>
          {SORT_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setSortMode(o.value)}
              className={cn(
                "rounded px-2 py-0.5 text-[0.6rem] transition-colors",
                sortMode === o.value
                  ? "bg-white/20 text-foreground"
                  : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="w-8 shrink-0 text-[0.55rem] text-foreground/50">Show</span>
          {FILTER_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setFilterMode(o.value)}
              className={cn(
                "rounded px-2 py-0.5 text-[0.6rem] transition-colors",
                filterMode === o.value
                  ? "bg-white/20 text-foreground"
                  : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* scrollable team list */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div style={{ width: NATURAL_W * effectiveScale, height: naturalH * effectiveScale, position: 'relative' }}>
          <div
            ref={innerRef}
            style={{ width: NATURAL_W, transform: `scale(${effectiveScale})`, transformOrigin: 'top left', position: 'absolute' }}
            className="flex flex-col gap-2 p-4"
          >
            <h2 className="mb-1 px-1 text-xs uppercase tracking-[0.18em] text-foreground/55">
              Teams · {division} ({sorted.length}/{divTeams.length})
            </h2>

            {sorted.map(team => {
              const isElim    = eliminatedTeams.has(team.name);
              const isPresent = present[team.id]  ?? false;
              const isWild    = wildcard[team.id] ?? false;

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
                  }}
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

                  {/* Row 2: division + present + wildcard + call */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={team.division}
                      onChange={e => update(team.id, "division", e.target.value as Division)}
                      className="rounded-lg border border-white/10 bg-white/10 px-2 py-0.5 text-[0.65rem] text-foreground/70 outline-none focus:border-white/30"
                    >
                      <option value="standards">STD</option>
                      <option value="open">OPEN</option>
                    </select>

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
                        onChange={e => setPresent(prev => ({ ...prev, [team.id]: e.target.checked }))}
                        className="sr-only"
                      />
                      {isPresent ? "Present" : "Absent"}
                    </label>

                    {/* Wildcard toggle — separate from present */}
                    <button
                      type="button"
                      onClick={() => setWildcard(prev => ({ ...prev, [team.id]: !prev[team.id] }))}
                      className={cn(
                        "rounded-lg border px-2 py-0.5 text-[0.65rem] transition-colors",
                        isWild
                          ? "border-purple-400/50 bg-purple-400/20 text-purple-300"
                          : "border-white/10 bg-white/5 text-foreground/40 hover:text-foreground/70",
                      )}
                    >
                      Wildcard
                    </button>

                    <button
                      type="button"
                      onClick={() => {}}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/8 px-2 py-0.5 text-[0.65rem] text-foreground/50 transition-colors hover:text-foreground/80"
                    >
                      <Phone size={10} strokeWidth={2} />
                      Call
                    </button>
                  </div>

                  {/* Row 3: score + notes */}
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={team.score ?? ""}
                      placeholder="Score"
                      onChange={e => update(team.id, "score", e.target.value === "" ? null : Number(e.target.value))}
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
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* scale slider */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-3 py-1.5">
        <span className="text-[0.55rem] text-foreground/35">Scale</span>
        <input
          type="range" min={0.4} max={1.6} step={0.05}
          value={effectiveScale}
          onChange={e => setManual(Number(e.target.value))}
          className="w-28 accent-white/50"
        />
        <span className="w-8 text-right text-[0.55rem] tabular-nums text-foreground/35">
          {Math.round(effectiveScale * 100)}%
        </span>
      </div>
    </div>
  );
}
