"use client";

import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { type Division, type Team } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import TeamDetailsModal from "./TeamDetailsModal";

const BASE_CARD_W = 260; // grid column min-width at scale = 1

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

type SortMode   = 'seed-desc' | 'seed-asc' | 'name';
type FilterMode = 'all' | 'present' | 'absent' | 'eliminated' | 'special';

// One-time/exhibition team — not tied to a division, never enters the
// bracket. Duplicated locally rather than imported from the server-only
// db module (see src/lib/db/specialTeams.ts). category is purely a display
// tag (unlike a real team's division) — it never affects bracket placement.
type SpecialTeamCategory = 'std' | 'open' | 'boss' | 'other';
type SpecialTeam = {
  id: string; name: string; email: string; phone: string; notes: string;
  category: SpecialTeamCategory; present: boolean;
};
type SpecialTeamInput = { name: string; email: string; phone: string; notes: string; category: SpecialTeamCategory };
type SpecialTeamPatch = Partial<Omit<SpecialTeam, 'id'>>;

const CATEGORY_LABEL: Record<SpecialTeamCategory, string> = {
  std: 'STD', open: 'OPEN', boss: 'BOSS', other: 'OTHER',
};

type Props = {
  teams: Team[];
  division: Division;
  eliminatedTeams: Set<string>;
  onTeamUpdate: (id: string, patch: Partial<Team>) => void;
  specialTeams: SpecialTeam[];
  onAddSpecialTeam: (input: SpecialTeamInput) => void;
  onUpdateSpecialTeam: (id: string, patch: SpecialTeamPatch) => void;
  onDeleteSpecialTeam: (id: string) => void;
};

export default function TeamList({
  teams, division, eliminatedTeams, onTeamUpdate,
  specialTeams, onAddSpecialTeam, onUpdateSpecialTeam, onDeleteSpecialTeam,
}: Props) {
  const [sortMode, setSortMode]     = useState<SortMode>('name');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [search, setSearch]         = useState('');
  const [compact, setCompact]       = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [rawScale, setRawScale]     = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef                = useRef<HTMLDivElement>(null);
  const [contactTeam, setContactTeam] = useState<Team | null>(null);

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
    switch (filterMode) {
      case 'present':    return isPresent && !isElim;
      case 'absent':     return !isPresent && !isElim;
      case 'eliminated': return isElim;
      default:           return true;
    }
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'seed-desc': return (b.seed ?? -Infinity) - (a.seed ?? -Infinity);
      case 'seed-asc':  return (a.seed ?? Infinity)  - (b.seed ?? Infinity);
      default:          return a.name.localeCompare(b.name);
    }
  });

  // Special teams aren't division-scoped (same list shows on both the
  // Standards and Open pages) and have no seed to sort by — just the name
  // search applies.
  const specialFiltered = specialTeams.filter(t =>
    !searchLower || t.name.toLowerCase().includes(searchLower)
  );

  function update(
    id: string,
    field: "seed" | "comment" | "present" | "wildcard",
    value: string | number | boolean | null,
  ) {
    onTeamUpdate(id, { [field]: value } as Partial<Team>);
  }

  function updateSpecial<K extends keyof SpecialTeamPatch>(id: string, field: K, value: SpecialTeamPatch[K]) {
    onUpdateSpecialTeam(id, { [field]: value } as SpecialTeamPatch);
  }

  // As the Scale slider shrinks cards, progressively drop detail — down to
  // just the team name at the smallest sizes — rather than squeezing every
  // control into a card too narrow to show it properly.
  const detailTier: 'full' | 'medium' | 'minimal' =
    scale >= 0.85 ? 'full' : scale >= 0.6 ? 'medium' : 'minimal';

  const SORT_OPTIONS: { label: string; value: SortMode }[] = [
    { label: 'Seed ↓', value: 'seed-desc' },
    { label: 'Seed ↑', value: 'seed-asc' },
    { label: 'Name', value: 'name' },
  ];

  const FILTER_OPTIONS: { label: string; value: FilterMode }[] = [
    { label: 'All', value: 'all' },
    { label: 'Present', value: 'present' },
    { label: 'Absent', value: 'absent' },
    { label: 'Elim.', value: 'eliminated' },
    { label: 'Special', value: 'special' },
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

          {/* Add Team — always shown, pinned right, opens the special-team
              add modal. Unlike the filter chips, it never hides at narrow
              widths. */}
          <button
            onClick={() => setShowAddModal(true)}
            className="ml-auto shrink-0 rounded px-2 py-0.5 text-[0.6rem] font-medium text-purple-300/80 transition-colors hover:bg-purple-400/15 hover:text-purple-200"
          >
            + Add Team
          </button>
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

          {/* Compact — always shown: unlike the filter chips, it never hides
              at narrow widths. */}
          <button
            onClick={() => setCompact(c => !c)}
            className={cn(
              "ml-auto shrink-0 rounded px-2 py-0.5 text-[0.6rem] font-medium transition-colors",
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
        {filterMode === 'special' ? (
          <>
            {/* Special / one-time teams — not tied to a division (same list
                shows on both the Standards and Open pages), never entered
                into the bracket. This filter is the only place they're
                visible; adding one happens through the "+ Add Team" modal.
                Same card layout as regular teams (grid, Compact toggle,
                Scale slider, detail tiers) minus the seed input — notes
                takes the full width in its place. */}
            <h2 className="mb-2 truncate px-1 text-xs uppercase tracking-[0.18em] text-foreground/55 @max-[220px]:text-[0.65rem] @max-[220px]:tracking-[0.08em] @max-[160px]:text-[0.55rem] @max-[160px]:tracking-normal">
              Special Teams ({specialFiltered.length}/{specialTeams.length})
            </h2>

            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${BASE_CARD_W * scale}px, 1fr))` }}
            >
              {specialFiltered.map(t => {
                const ringClass = t.present ? "ring-1 ring-green-400/70" : "ring-1 ring-red-400/50";

                return (
                  <div
                    key={t.id}
                    className={cn("relative flex flex-col gap-2 rounded-2xl border border-white/22 bg-[#0d1018] p-3", ringClass)}
                  >
                    <button
                      type="button"
                      onClick={() => onDeleteSpecialTeam(t.id)}
                      aria-label={`Delete ${t.name}`}
                      className="absolute right-2 top-2 rounded px-1 text-foreground/30 transition-colors hover:bg-red-400/20 hover:text-red-300"
                    >
                      ✕
                    </button>

                    {compact ? (
                      /* Compact: just name + present/absent (border above already shows it too) */
                      <div className="flex items-center gap-2 pr-4">
                        <span className="flex-1 truncate text-sm font-medium leading-tight">{t.name}</span>
                        <span className="shrink-0 text-xs text-foreground/50">{t.present ? 'Present' : 'Absent'}</span>
                      </div>
                    ) : detailTier === 'minimal' ? (
                      /* Scaled down far enough that only the name still fits */
                      <span className="truncate pr-4 text-sm font-medium leading-tight">{t.name}</span>
                    ) : (
                      <>
                        {/* Row 1: name */}
                        <div className="flex items-center gap-2 pr-4">
                          <span className="flex-1 text-sm font-medium leading-tight">{t.name}</span>
                        </div>

                        {/* Row 2: category (full only) + present/absent + call (full only) */}
                        <div className="flex items-center gap-1.5">
                          {detailTier === 'full' && (
                            <select
                              value={t.category}
                              onChange={e => updateSpecial(t.id, "category", e.target.value as SpecialTeamCategory)}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] text-foreground/50 outline-none"
                            >
                              {(Object.keys(CATEGORY_LABEL) as SpecialTeamCategory[]).map(c => (
                                <option key={c} value={c} className="bg-[#0d1018]">{CATEGORY_LABEL[c]}</option>
                              ))}
                            </select>
                          )}

                          {/* Present/Absent toggle */}
                          <label className={cn(
                            "flex cursor-pointer select-none items-center gap-1 rounded-lg border px-2 py-0.5 text-[0.65rem] transition-colors",
                            t.present
                              ? "border-green-400/40 bg-green-400/15 text-green-300"
                              : "border-red-400/30 bg-red-400/10 text-red-300/70",
                          )}>
                            <input
                              type="checkbox"
                              checked={t.present}
                              onChange={e => updateSpecial(t.id, "present", e.target.checked)}
                              className="sr-only"
                            />
                            {t.present ? "Present" : "Absent"}
                          </label>

                          {detailTier === 'full' && t.phone && (
                            <a
                              href={`tel:${t.phone}`}
                              className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/8 px-2 py-0.5 text-[0.65rem] text-foreground/50 transition-colors hover:text-foreground/80"
                            >
                              <Phone size={10} strokeWidth={2} />
                              Call
                            </a>
                          )}
                        </div>

                        {/* Row 3: notes — full detail only, full width (no seed here) */}
                        {detailTier === 'full' && (
                          <textarea
                            value={t.notes}
                            placeholder="Notes…"
                            rows={1}
                            onChange={e => updateSpecial(t.id, "notes", e.target.value)}
                            className="w-full resize-none rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-xs placeholder:text-foreground/30 outline-none focus:border-white/30"
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
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
                className={cn(
                  "relative flex flex-col gap-2 rounded-2xl border border-white/22 p-3",
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
                    {/* Row 1: name */}
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex-1 text-sm font-medium leading-tight",
                        isWild    && "text-purple-300",
                        isElim    && "text-foreground/40 line-through decoration-red-400/50",
                      )}>
                        {team.name}
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
                          onClick={() => setContactTeam(team)}
                          className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/8 px-2 py-0.5 text-[0.65rem] text-foreground/50 transition-colors hover:text-foreground/80"
                        >
                          <Phone size={10} strokeWidth={2} />
                          Contact
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
          </>
        )}
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

      {/* Add-team interface — opened by the "+ Add Team" button in the Sort
          row. Adding one automatically switches to the Special filter so
          the result is immediately visible. */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-strong mx-4 w-full max-w-sm rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Add Special Team</h2>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="text-foreground/50 hover:text-foreground/80"
              >
                ✕
              </button>
            </div>
            <SpecialTeamAddForm
              onAdd={input => {
                onAddSpecialTeam(input);
                setFilterMode('special');
                setShowAddModal(false);
              }}
            />
          </div>
        </div>
      )}

      {contactTeam && (
        <TeamDetailsModal
          teamId={contactTeam.id}
          teamName={contactTeam.name}
          division={contactTeam.division}
          onClose={() => setContactTeam(null)}
        />
      )}
    </div>
  );
}

function SpecialTeamAddForm({ onAdd }: { onAdd: (input: SpecialTeamInput) => void }) {
  const [name, setName]         = useState('');
  const [category, setCategory] = useState<SpecialTeamCategory>('other');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [notes, setNotes]       = useState('');

  const fieldClass = "min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs placeholder:text-foreground/30 outline-none focus:border-white/30";

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({ name: trimmed, category, email: email.trim(), phone: phone.trim(), notes: notes.trim() });
    setName('');
    setCategory('other');
    setEmail('');
    setPhone('');
    setNotes('');
  }

  function onEnter(e: React.KeyboardEvent) { if (e.key === 'Enter') submit(); }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          type="text" value={name} placeholder="Team name"
          onChange={e => setName(e.target.value)} onKeyDown={onEnter}
          className={fieldClass}
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value as SpecialTeamCategory)}
          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground/70 outline-none focus:border-white/30"
        >
          {(Object.keys(CATEGORY_LABEL) as SpecialTeamCategory[]).map(c => (
            <option key={c} value={c} className="bg-[#0d1018]">{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-1.5">
        <input
          type="email" value={email} placeholder="Email"
          onChange={e => setEmail(e.target.value)} onKeyDown={onEnter}
          className={fieldClass}
        />
        <input
          type="tel" value={phone} placeholder="Phone"
          onChange={e => setPhone(e.target.value)} onKeyDown={onEnter}
          className={fieldClass}
        />
      </div>
      <div className="flex gap-1.5">
        <input
          type="text" value={notes} placeholder="Notes (optional)"
          onChange={e => setNotes(e.target.value)} onKeyDown={onEnter}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
