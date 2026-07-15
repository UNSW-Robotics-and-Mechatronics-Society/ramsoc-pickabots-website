import { useMemo, useState } from "react";
import { type BracketMatch } from "@/lib/mock-data";

/**
 * Shared team-filter state — every panel that lets a user type/pick a team
 * to dim non-matching matches (admin Bracket, admin Match List, the public
 * Bracket page, the public Match List) calls this independently, scoped to
 * whatever match list it passes in (already division-filtered). `onAdd`
 * fires with the resolved team name right after it's added, so callers can
 * attach their own side effect — panning a canvas to it, scrolling a list
 * to it, or nothing at all.
 */
export function useTeamFilter(matches: BracketMatch[], onAdd?: (name: string) => void) {
  const [teamFilters, setTeamFilters]         = useState<string[]>([]);
  const [teamInput, setTeamInput]             = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const allTeamNames = useMemo(() => {
    const names = new Set<string>();
    for (const m of matches) {
      if (m.slotA.teamName) names.add(m.slotA.teamName);
      if (m.slotB.teamName) names.add(m.slotB.teamName);
    }
    return Array.from(names).sort();
  }, [matches]);

  const teamSuggestions = useMemo(() => {
    const q = teamInput.trim().toLowerCase();
    if (!q) return [];
    return allTeamNames.filter(n => n.toLowerCase().includes(q) && !teamFilters.includes(n)).slice(0, 8);
  }, [teamInput, allTeamNames, teamFilters]);

  const filterSet = useMemo(() => new Set(teamFilters), [teamFilters]);

  function addTeamFilter(rawName: string) {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    const exact = allTeamNames.find(n => n.toLowerCase() === trimmed.toLowerCase());
    const resolved = exact ?? (teamSuggestions.length === 1 ? teamSuggestions[0] : null);
    setTeamInput('');
    setShowSuggestions(false);
    if (!resolved || teamFilters.includes(resolved)) return;
    setTeamFilters(prev => [...prev, resolved]);
    onAdd?.(resolved);
  }

  function removeTeamFilter(name: string) {
    setTeamFilters(prev => prev.filter(t => t !== name));
  }

  return {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  };
}

/** True when a team filter is active and neither slot matches it. */
export function isMatchDimmed(m: BracketMatch, filterSet: Set<string>): boolean {
  return filterSet.size > 0 && !filterSet.has(m.slotA.teamName) && !filterSet.has(m.slotB.teamName);
}
