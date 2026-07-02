"use client";

import { useMemo, useState } from "react";
import {
  type BracketMatch, type Division, type MatchStatus, type TeamCount,
  MOCK_BRACKET_MATCHES, MOCK_TEAMS, DEFAULT_TEAM_COUNT,
  generateDoubleElimBracket, transferBracket,
} from "@/lib/mock-data";
import {
  type MatchSchedule,
  generateSchedule, defaultScheduleOrder, START_MINUTE,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { useAdminPanels, type PanelId } from "./AdminPanelContext";
import MultiPanelSplit from "./MultiPanelSplit";
import TeamList        from "./TeamList";
import AdminBracket    from "./AdminBracket";
import MatchesPanel    from "./MatchesPanel";
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

/**
 * Derives active/next/todo statuses from the schedule order for one division.
 * The first `concurrentRings` non-completed matches → active.
 * The next `concurrentRings` non-completed matches → next.
 * Completed and skipped statuses are always preserved.
 */
function applyScheduleStatus(
  matches: BracketMatch[],
  schedule: MatchSchedule,
  division: Division,
): BracketMatch[] {
  const byId = new Map(matches.map(m => [m.id, m]));

  const pending = schedule.slots
    .flatMap(s => s.matchIds)
    .filter(id => {
      const m = byId.get(id);
      return m && m.division === division && m.status !== 'completed' && m.status !== 'skipped';
    });

  const N         = schedule.concurrentRings;
  const activeSet = new Set(pending.slice(0, N));
  const nextSet   = new Set(pending.slice(N, N * 2));

  return matches.map(m => {
    if (m.division !== division) return m;
    if (m.status === 'completed' || m.status === 'skipped') return m;

    const newStatus: MatchStatus =
      activeSet.has(m.id) ? 'active' :
      nextSet.has(m.id)   ? 'next'   :
      'todo';

    return m.status === newStatus ? m : { ...m, status: newStatus };
  });
}

function initSchedules(matches: BracketMatch[]): Record<Division, MatchSchedule> {
  return {
    standards: generateSchedule(defaultScheduleOrder(matches, 'standards')),
    open:      generateSchedule(defaultScheduleOrder(matches, 'open')),
  };
}

const ALL_PANEL_IDS: PanelId[] = ['teams', 'bracket', 'matches'];
const TEAM_COUNTS: TeamCount[] = [4, 8, 16, 32, 64];
// Stable reference: 25% / 50% / 25% when all three panels are visible
const DEFAULT_3_PANEL_DIVIDERS = [25, 75];

type Props = { division: Division };

export default function AdminPageClient({ division }: Props) {
  const [matches,      setMatches]   = useState<BracketMatch[]>(MOCK_BRACKET_MATCHES);
  const [teamCount,    setTeamCount] = useState<TeamCount>(DEFAULT_TEAM_COUNT);
  const [pendingCount, setPending]   = useState<TeamCount | null>(null);
  const [schedules,    setSchedules] = useState<Record<Division, MatchSchedule>>(
    () => initSchedules(MOCK_BRACKET_MATCHES),
  );

  const { visiblePanels } = useAdminPanels();

  const eliminatedTeams = useMemo(() => computeEliminated(matches), [matches]);

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
    // Rebuild schedules for both divisions, preserving ring count and timing params
    setSchedules(prev => ({
      [division]: generateSchedule(
        defaultScheduleOrder(newMatches, division),
        prev[division].concurrentRings,
        prev[division].slots[0]?.startMinute ?? START_MINUTE,
        prev[division].matchMinutes,
        prev[division].gapMinutes,
      ),
      [otherDiv]: generateSchedule(
        defaultScheduleOrder(newMatches, otherDiv),
        prev[otherDiv].concurrentRings,
        prev[otherDiv].slots[0]?.startMinute ?? START_MINUTE,
        prev[otherDiv].matchMinutes,
        prev[otherDiv].gapMinutes,
      ),
    } as Record<Division, MatchSchedule>));
    setTeamCount(n);
    setPending(null);
  }

  // ── build panel list for MultiPanelSplit ─────────────────────────────────────
  const panels = ALL_PANEL_IDS
    .filter(p => visiblePanels.includes(p))
    .map(p => ({
      key:  p,
      node: p === 'teams' ? (
        <TeamList
          teams={MOCK_TEAMS}
          division={division}
          eliminatedTeams={eliminatedTeams}
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
              teams={MOCK_TEAMS}
              matches={effectiveMatches}
              division={division}
              teamCount={teamCount}
              onMatchesChange={setMatches}
            />
          </div>
        </div>
      ) : (
        <MatchesPanel
          matches={effectiveMatches}
          division={division}
          teamCount={teamCount}
          schedule={schedules[division]}
          teams={MOCK_TEAMS}
          onScheduleChange={s =>
            setSchedules(prev => ({ ...prev, [division]: s }))
          }
          onMatchesChange={setMatches}
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
