"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BracketMatch, type Division, type Team, type TeamCount,
  generateDoubleElimBracket, transferBracket, completeRound1Byes,
} from "@/lib/mock-data";
import {
  type ConcurrentRings, type MatchSchedule, type ExhibitionSchedule,
  generateSchedule, applyScheduleStatus, rollSchedule, rollExhibitionSchedule, START_MINUTE, MAX_RINGS,
} from "@/lib/schedule";
import { type PanelId } from "./AdminPanelContext";
import PanelGrid        from "./PanelGrid";
import TeamList        from "./TeamList";
import AdminBracket    from "./AdminBracket";
import MatchesPanel    from "./MatchesPanel";
import ConfirmDialog   from "./ConfirmDialog";
import PlayersPanel    from "./PlayersPanel";
import SettingsPanel   from "./SettingsPanel";

// ── eliminated teams (only LB losers; WB losers still alive in LB) ────────────
function computeEliminated(matches: BracketMatch[]): Set<string> {
  const out = new Set<string>();
  for (const m of matches) {
    if (m.status !== 'completed' || m.side !== 'losers') continue;
    const aWon = m.slotA.score >= m.targetScore;
    const bWon = m.slotB.score >= m.targetScore;
    if (aWon && m.slotB.teamName) out.add(m.slotB.teamName);
    if (bWon && m.slotA.teamName) out.add(m.slotA.teamName);
  }
  return out;
}

const TEAM_COUNTS: TeamCount[] = [4, 8, 16, 32, 64];

// A single parsed row of the "Import seeds" CSV. Shared shape between the
// Settings panel (which parses the file) and the import handler here (which
// matches names against the team list).
export type SeedImportRow = { name: string; division: Division; seed: number };
export type SeedImportResult = { imported: number; unmatched: SeedImportRow[] };

// Standard balanced seeding order: expands recursively so seed 1 lands in M1
// and seed 2 in M_last (opposite halves). For 8 matches → [1,8,5,4,3,6,7,2].
// Lifted from AdminBracket so both the bracket's Auto Fill button and the
// Settings panel's post-import prompt can re-seed Round 1 identically.
function seedOrder(N: number): number[] {
  let seeds = [1];
  let tc = 2;
  while (seeds.length < N) {
    const next: number[] = [];
    for (let p = 0; p < seeds.length; p++) {
      const s = seeds[p], comp = tc + 1 - s;
      if (p % 2 === 0) { next.push(s, comp); } else { next.push(comp, s); }
    }
    seeds = next;
    tc *= 2;
  }
  return seeds;
}

type InitialBracket = {
  matches: BracketMatch[];
  teamCount: TeamCount;
  schedules: Record<Division, MatchSchedule>;
  exhibitionSchedule: ExhibitionSchedule;
};

// One-time/exhibition team, kept in its own table — never division-scoped,
// never fed into the bracket. Duplicated locally rather than imported from
// the server-only db module (see src/lib/db/specialTeams.ts).
type SpecialTeamCategory = 'std' | 'open' | 'boss' | 'other';
type SpecialTeam = {
  id: string; name: string; email: string; phone: string; notes: string;
  category: SpecialTeamCategory; present: boolean; inBracket: boolean;
};
type SpecialTeamInput = { name: string; email: string; phone: string; notes: string; category: SpecialTeamCategory };
type SpecialTeamPatch = Partial<Omit<SpecialTeam, 'id'>>;

type Props = {
  division: Division;
  initialTeams: Team[];
  initialSpecialTeams: SpecialTeam[];
  initialBracket: InitialBracket;
};

export default function AdminPageClient({ division, initialTeams, initialSpecialTeams, initialBracket }: Props) {
  const [teams,        setTeams]     = useState<Team[]>(initialTeams);
  const [specialTeams, setSpecialTeams] = useState<SpecialTeam[]>(initialSpecialTeams);
  const [matches,      setMatches]   = useState<BracketMatch[]>(initialBracket.matches);
  const [teamCount,    setTeamCount] = useState<TeamCount>(initialBracket.teamCount);
  const [pendingCount, setPending]   = useState<TeamCount | null>(null);
  const [schedules,    setSchedules] = useState<Record<Division, MatchSchedule>>(initialBracket.schedules);
  const [exhibitionSchedule, setExhibitionSchedule] = useState<ExhibitionSchedule>(initialBracket.exhibitionSchedule);

  // Debounced save-on-change — skips the very first render, since that's
  // just the server-fetched initial state being echoed back.
  const isFirstRender = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/admin/bracket', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches, teamCount, schedules, exhibitionSchedule }),
      }).catch(err => console.error('[admin] bracket save failed:', err));
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [matches, teamCount, schedules, exhibitionSchedule]);

  const teamSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function handleTeamUpdate(id: string, patch: Partial<Team>) {
    setTeams(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

    const key = `${id}-${Object.keys(patch).sort().join(',')}`;
    clearTimeout(teamSaveTimers.current[key]);
    teamSaveTimers.current[key] = setTimeout(() => {
      fetch(`/api/admin/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(err => console.error('[admin] team update failed:', err));
    }, 300);
  }

  // ── special (one-time/exhibition) teams ──────────────────────────────────────
  async function handleAddSpecialTeam(input: SpecialTeamInput) {
    try {
      const res = await fetch('/api/admin/special-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Add failed');
      const created: SpecialTeam = await res.json();
      setSpecialTeams(prev => [created, ...prev]);
    } catch (err) {
      console.error('[admin] add special team failed:', err);
    }
  }

  const specialTeamSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function handleUpdateSpecialTeam(id: string, patch: SpecialTeamPatch) {
    setSpecialTeams(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

    const key = `${id}-${Object.keys(patch).sort().join(',')}`;
    clearTimeout(specialTeamSaveTimers.current[key]);
    specialTeamSaveTimers.current[key] = setTimeout(() => {
      fetch(`/api/admin/special-teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(err => console.error('[admin] special team update failed:', err));
    }, 300);
  }

  async function handleDeleteSpecialTeam(id: string) {
    const prev = specialTeams;
    setSpecialTeams(cur => cur.filter(t => t.id !== id));
    try {
      const res = await fetch(`/api/admin/special-teams/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch (err) {
      console.error('[admin] delete special team failed:', err);
      setSpecialTeams(prev); // revert on failure
    }
  }

  const eliminatedTeams = useMemo(() => computeEliminated(matches), [matches]);

  // Lead-time captain SMS alerts fire server-side in saveBracketState (see
  // lib/db/bracket.ts) on every bracket save, so they work regardless of who's
  // viewing /admin and honour the configurable notify-lead.

  // Schedule-derived active/next/todo status — computed for BOTH divisions
  // (mirrors saveBracketState's server-side reconciliation), not just the
  // currently-selected one. Completed and skipped are preserved; the
  // schedule order determines everything else. Exhibition matches are exempt
  // (see applyScheduleStatus) — their status is entirely admin-controlled
  // via the dropdown, so `matches` already reflects it with no derivation.
  const effectiveMatches = useMemo(
    () => (['standards', 'open'] as Division[]).reduce(
      (acc, d) => applyScheduleStatus(acc, schedules[d], d), matches,
    ),
    [matches, schedules],
  );

  // ── bracket size change ──────────────────────────────────────────────────────
  function hasBracketData(div: Division): boolean {
    return matches.some(m =>
      m.division === div && (m.slotA.teamName !== '' || m.slotB.teamName !== '')
    );
  }

  function requestSizeChange(n: TeamCount) {
    if (n === teamCount) return;
    if (hasBracketData(division)) {
      setPending(n);
    } else {
      applySizeChange(n);
    }
  }

  function applySizeChange(n: TeamCount) {
    const otherDiv    = division === 'standards' ? 'open' : 'standards';
    const transferred = transferBracket(matches, division, teamCount, n);
    const otherMatches = generateDoubleElimBracket(n, otherDiv);
    const newMatches   = [...transferred, ...otherMatches];
    setMatches(newMatches);
    // Rebuild schedules for both divisions as rolling schedules (only the
    // currently-playable matches), preserving ring count and timing params.
    setSchedules(prev => {
      const rebuild = (d: Division) => rollSchedule(
        generateSchedule(
          [],
          prev[d].concurrentRings,
          prev[d].rings[0]?.[0]?.startMinute ?? START_MINUTE,
          prev[d].matchMinutes,
          prev[d].gapMinutes,
        ),
        newMatches,
        d,
      );
      return { [division]: rebuild(division), [otherDiv]: rebuild(otherDiv) } as Record<Division, MatchSchedule>;
    });
    setTeamCount(n);
    setPending(null);
  }

  // Any change to matches re-rolls the current division's schedule: newly-ready
  // matches (teams just decided by a completed feeder) get appended, anything
  // no longer playable is dropped — keeping the match list a rolling list of
  // only-playable matches.
  function commitMatches(next: BracketMatch[]) {
    setMatches(next);
    setSchedules(prev => ({ ...prev, [division]: rollSchedule(prev[division], next, division) }));
  }

  // ── auto-fill Round 1 from the In-Bracket teams ──────────────────────────────
  // Re-seeds the CURRENT division's WB Round 1 from its in-bracket teams (seeded
  // by seed, unseeded shuffled into leftover slots), overwriting existing teams/
  // scores. Lifted out of AdminBracket so the bracket's Auto Fill button and the
  // Settings panel's post-import prompt share one implementation.
  function handleAutoFill() {
    const div = division;
    // In-bracket = explicit override, else auto (has a seed) — same rule as the
    // Teams list toggle. A seeded team turned off keeps its seed but is skipped.
    const divTeams = teams.filter(t => t.division === div && (t.inBracket ?? (t.seed != null)));
    const withSeed = [...divTeams.filter(t => t.seed !== null)].sort((a, b) => (b.seed ?? 0) - (a.seed ?? 0));
    const noSeed   = [...divTeams.filter(t => t.seed === null)];
    for (let i = noSeed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [noSeed[i], noSeed[j]] = [noSeed[j], noSeed[i]];
    }
    const sorted = [...withSeed, ...noSeed];

    const r1 = matches
      .filter(m => m.division === div && m.side === 'winners' && m.round === 1)
      .sort((a, b) => a.matchNumber - b.matchNumber);
    const numMatches = r1.length;
    const T = 2 * numMatches;
    const slotASeeds = seedOrder(numMatches);

    const seeded = matches.map(m => {
      if (m.division !== div || m.side !== 'winners' || m.round !== 1) return m;
      const i     = r1.findIndex(r => r.id === m.id);
      const aSeed = slotASeeds[i];
      const bSeed = T + 1 - aSeed;
      return {
        ...m,
        slotA: { teamName: sorted[aSeed - 1]?.name ?? '', score: 0 },
        slotB: { teamName: sorted[bSeed - 1]?.name ?? '', score: 0 },
      };
    });

    // Any R1 match left with a single team (fewer in-bracket teams than slots)
    // is a bye: auto-complete it and advance that team to R2 so it never shows
    // up as a playable match. rollSchedule then excludes it from the list.
    const resolved = completeRound1Byes(seeded, div);

    setMatches(resolved);
    setSchedules(prev => ({
      ...prev,
      [div]: rollSchedule(
        generateSchedule(
          [],
          prev[div].concurrentRings,
          prev[div].rings[0]?.[0]?.startMinute ?? START_MINUTE,
          prev[div].matchMinutes,
          prev[div].gapMinutes,
        ),
        resolved,
        div,
      ),
    }));
  }

  // ── bulk team actions (Settings panel) — current division only ───────────────
  async function bulkPostTeams(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/teams/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Bulk update failed');
  }

  async function handleSetAllPresent(present: boolean) {
    const ids = teams.filter(t => t.division === division).map(t => t.id);
    setTeams(prev => prev.map(t => t.division === division ? { ...t, present } : t));
    await bulkPostTeams({ ids, present });
  }

  async function handleSetAllInBracket(inBracket: boolean) {
    const ids = teams.filter(t => t.division === division).map(t => t.id);
    setTeams(prev => prev.map(t => t.division === division ? { ...t, inBracket } : t));
    await bulkPostTeams({ ids, inBracket });
  }

  // Matches each CSV row to an existing team by name+division (teams come from
  // the shared registration table, so import can only update seeds, never
  // create teams). Returns how many matched and which rows didn't — the
  // caller surfaces the skipped list.
  async function handleImportSeeds(rows: SeedImportRow[]): Promise<SeedImportResult> {
    const norm = (s: string) => s.trim().toLowerCase();
    const matched: { id: string; seed: number }[] = [];
    const unmatched: SeedImportRow[] = [];
    for (const row of rows) {
      const team = teams.find(t => t.division === row.division && norm(t.name) === norm(row.name));
      if (team) matched.push({ id: team.id, seed: row.seed });
      else unmatched.push(row);
    }

    if (matched.length > 0) {
      const seedById = new Map(matched.map(m => [m.id, m.seed]));
      setTeams(prev => prev.map(t => seedById.has(t.id) ? { ...t, seed: seedById.get(t.id)! } : t));
      await bulkPostTeams({ seeds: matched });
    }
    return { imported: matched.length, unmatched };
  }

  // ── full competition reset ("Reset All") ──────────────────────────────────────
  // Clears every match's teams/scores/status across BOTH divisions and drops
  // exhibition matches entirely — same transform the old per-division "Clear
  // Teams" used, just applied everywhere. Persisted via the normal debounced
  // bracket-save effect above (matches submitted without exhibition rows are
  // deleted server-side — see saveBracketState's stale-row cleanup), which
  // also refunds/deletes any votes tied to matches it invalidates. Separately,
  // wipes ALL voting history and resets every balance to 100 — the bracket
  // save alone doesn't reach votes on already-resolved matches. Leaves
  // teams/special_teams rows themselves untouched (special teams especially —
  // only their bracket placement, which they never had, would be affected).
  async function handleResetAll() {
    // Regenerate both divisions from scratch rather than blanking the matches
    // already loaded. Clearing in place froze the bracket's SHAPE at whatever
    // was in the table, so a change to the generator (the wildcard boxes, say)
    // could never be picked up by a reset — the only way out was deleting the
    // rows by hand. saveBracketState's stale-row cleanup deletes whatever the
    // new set no longer contains, so the shape genuinely follows the generator.
    // Exhibition matches are dropped, same as before: the generator emits none.
    const regenerated = (['standards', 'open'] as Division[])
      .flatMap(d => generateDoubleElimBracket(teamCount, d));

    const rebuildSchedule = (d: Division, s: MatchSchedule): MatchSchedule => {
      const safeRings = Math.min(MAX_RINGS, Math.max(1, s.concurrentRings)) as ConcurrentRings;
      return rollSchedule(
        generateSchedule([], safeRings, s.rings[0]?.[0]?.startMinute ?? START_MINUTE, s.matchMinutes, s.gapMinutes),
        regenerated,
        d,
      );
    };

    setMatches(regenerated);
    setSchedules({ standards: rebuildSchedule('standards', schedules.standards), open: rebuildSchedule('open', schedules.open) });
    // regenerated has no exhibition matches (the generator emits none), so this
    // empties every exhibition ring's contents while keeping the ring
    // columns themselves — same as the per-division behavior this replaced.
    setExhibitionSchedule(prev => rollExhibitionSchedule(prev, regenerated));

    try {
      const res = await fetch('/api/admin/reset-all', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Reset failed');
    } catch (err) {
      console.error('[admin] reset-all failed:', err);
    }
  }

  // ── panel content for the draggable/resizable grid ──────────────────────────
  // Every panel's node is built here; PanelGrid mounts only the ones currently
  // on the grid (see AdminPanelContext.visiblePanels), so the unused ones never
  // render. Each panel keeps its own container-query layout — the grid only
  // resizes the tile's box, so font sizes stay constant.
  const panelMap: Record<PanelId, { title: string; node: React.ReactNode }> = {
    teams: {
      title: 'Teams',
      node: (
        <TeamList
          teams={teams}
          division={division}
          eliminatedTeams={eliminatedTeams}
          onTeamUpdate={handleTeamUpdate}
          specialTeams={specialTeams}
          onAddSpecialTeam={handleAddSpecialTeam}
          onUpdateSpecialTeam={handleUpdateSpecialTeam}
          onDeleteSpecialTeam={handleDeleteSpecialTeam}
        />
      ),
    },
    bracket: {
      title: 'Bracket',
      node: (
        <div className="flex h-full flex-col">
          {/* Bracket size ("Number of Teams") and Reset All now live in the
              Settings panel; the bracket keeps only its own Auto Fill button. */}
          <div className="min-h-0 flex-1">
            <AdminBracket
              teams={teams}
              matches={effectiveMatches}
              division={division}
              teamCount={teamCount}
              schedule={schedules[division]}
              onMatchesChange={commitMatches}
              onScheduleChange={s => setSchedules(prev => ({ ...prev, [division]: s }))}
              onAutoFill={handleAutoFill}
            />
          </div>
        </div>
      ),
    },
    matches: {
      title: 'Matches',
      node: (
        <MatchesPanel
          matches={effectiveMatches}
          division={division}
          teamCount={teamCount}
          schedule={schedules[division]}
          exhibitionSchedule={exhibitionSchedule}
          teams={teams}
          specialTeams={specialTeams}
          onScheduleChange={s =>
            setSchedules(prev => ({ ...prev, [division]: s }))
          }
          onExhibitionScheduleChange={setExhibitionSchedule}
          onMatchesChange={commitMatches}
        />
      ),
    },
    players:  { title: 'Players',  node: <PlayersPanel /> },
    settings: {
      title: 'Settings',
      node: (
        <SettingsPanel
          division={division}
          teamCount={teamCount}
          teamCounts={TEAM_COUNTS}
          onTeamCountChange={requestSizeChange}
          onSetAllPresent={handleSetAllPresent}
          onSetAllInBracket={handleSetAllInBracket}
          onImportSeeds={handleImportSeeds}
          onAutoFill={handleAutoFill}
          onResetAll={handleResetAll}
        />
      ),
    },
  };

  return (
    <>
      {/* Draggable / resizable panel grid */}
      <div className="h-full w-full">
        <PanelGrid panels={panelMap} />
      </div>

      {/* Confirm bracket size change */}
      {pendingCount !== null && (
        <ConfirmDialog
          title={`Change bracket to ${pendingCount} teams?`}
          message="The bracket has existing data. Later rounds (finals, semis, quarters) will be kept. Earlier rounds that no longer exist will be discarded."
          confirmLabel="Change size"
          onConfirm={() => applySizeChange(pendingCount)}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
