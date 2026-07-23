"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BracketMatch, type Division, type Team, type TeamCount,
  generateDoubleElimBracket, transferBracket,
} from "@/lib/mock-data";
import {
  type MatchSchedule,
  generateSchedule, applyScheduleStatus, rollSchedule, START_MINUTE,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { useAdminPanels, type PanelId } from "./AdminPanelContext";
import MultiPanelSplit from "./MultiPanelSplit";
import TeamList        from "./TeamList";
import AdminBracket    from "./AdminBracket";
import MatchesPanel, { MIN_MATCH_LIST_W } from "./MatchesPanel";
import ConfirmDialog   from "./ConfirmDialog";

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

const ALL_PANEL_IDS: PanelId[] = ['teams', 'bracket', 'matches'];
const TEAM_COUNTS: TeamCount[] = [4, 8, 16, 32, 64];
// Stable reference: 25% / 50% / 25% when all three panels are visible
const DEFAULT_3_PANEL_DIVIDERS = [25, 75];

type InitialBracket = {
  matches: BracketMatch[];
  teamCount: TeamCount;
  schedules: Record<Division, MatchSchedule>;
};

type Props = {
  division: Division;
  initialTeams: Team[];
  initialBracket: InitialBracket;
};

export default function AdminPageClient({ division, initialTeams, initialBracket }: Props) {
  const [teams,        setTeams]     = useState<Team[]>(initialTeams);
  const [matches,      setMatches]   = useState<BracketMatch[]>(initialBracket.matches);
  const [teamCount,    setTeamCount] = useState<TeamCount>(initialBracket.teamCount);
  const [pendingCount, setPending]   = useState<TeamCount | null>(null);
  const [schedules,    setSchedules] = useState<Record<Division, MatchSchedule>>(initialBracket.schedules);

  const { visiblePanels } = useAdminPanels();

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
        body: JSON.stringify({ matches, teamCount, schedules }),
      }).catch(err => console.error('[admin] bracket save failed:', err));
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [matches, teamCount, schedules]);

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

  const eliminatedTeams = useMemo(() => computeEliminated(matches), [matches]);

  // Auto-notify captains by SMS the moment a match becomes "next" on-deck, for
  // both divisions (the admin may only be viewing one at a time). The server
  // dedups persistently via `captain_notified`, so a stray duplicate POST from
  // this ref resetting (e.g. remount) is harmless.
  const notifiedNextRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const d of ["standards", "open"] as Division[]) {
      const eff = applyScheduleStatus(matches, schedules[d], d);
      for (const m of eff) {
        if (
          m.status === "next" &&
          m.slotA.teamName &&
          m.slotB.teamName &&
          !notifiedNextRef.current.has(m.id)
        ) {
          notifiedNextRef.current.add(m.id);
          fetch("/api/admin/notify-next", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: m.id }),
          }).catch(() => {});
        }
      }
    }
  }, [matches, schedules]);

  // Schedule-derived active/next/todo status for the current division.
  // Completed and skipped are preserved; the schedule order determines everything else.
  const effectiveMatches = useMemo(
    () => applyScheduleStatus(matches, schedules[division], division),
    [matches, schedules, division],
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

  // ── build panel list for MultiPanelSplit ─────────────────────────────────────
  const panels = ALL_PANEL_IDS
    .filter(p => visiblePanels.includes(p))
    .map(p => ({
      key:   p,
      minPx: p === 'matches' ? MIN_MATCH_LIST_W : undefined,
      node: p === 'teams' ? (
        <TeamList
          teams={teams}
          division={division}
          eliminatedTeams={eliminatedTeams}
          onTeamUpdate={handleTeamUpdate}
        />
      ) : p === 'bracket' ? (
        <div className="flex h-full flex-col">
          {/* Bracket size selector */}
          <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-3 py-1.5">
            <span className="mr-1 text-[0.55rem] uppercase tracking-wider text-foreground/40">Teams</span>
            {TEAM_COUNTS.map(n => (
              <button
                key={n}
                onClick={() => requestSizeChange(n)}
                className={cn(
                  "rounded px-2 py-0.5 text-[0.6rem] transition-colors",
                  teamCount === n
                    ? "bg-white/20 text-foreground"
                    : "text-foreground/50 hover:text-foreground/80",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <AdminBracket
              teams={teams}
              matches={effectiveMatches}
              division={division}
              teamCount={teamCount}
              schedule={schedules[division]}
              onMatchesChange={commitMatches}
              onScheduleChange={s => setSchedules(prev => ({ ...prev, [division]: s }))}
            />
          </div>
        </div>
      ) : (
        <MatchesPanel
          matches={effectiveMatches}
          division={division}
          teamCount={teamCount}
          schedule={schedules[division]}
          teams={teams}
          onScheduleChange={s =>
            setSchedules(prev => ({ ...prev, [division]: s }))
          }
          onMatchesChange={commitMatches}
        />
      ),
    }));

  return (
    <>
      {/* Panels */}
      <div className="h-full w-full">
        <MultiPanelSplit
          panels={panels}
          defaultPercents={panels.length === 3 ? DEFAULT_3_PANEL_DIVIDERS : undefined}
        />
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
