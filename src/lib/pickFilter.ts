import { useState } from "react";

/**
 * Type-to-search, click-to-pick multi-select over a ranked list — the
 * leaderboard's counterpart to lib/teamFilter's useTeamFilter, generalised
 * over any id'd, named row so the player board and the team board share one
 * implementation.
 *
 * Typing only populates `suggestions`; picking is what narrows `visible`.
 * With nothing picked, `visible` is the full list (a leaderboard shows
 * everyone by default), so this filters rather than searches.
 */
export function usePickFilter<T extends { id: string; name: string }>(items: T[], limit = 8) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const pickedSet = new Set(picked);
  const q = query.trim().toLowerCase();

  const suggestions = q
    ? items.filter(i => i.name.toLowerCase().includes(q) && !pickedSet.has(i.id)).slice(0, limit)
    : [];

  const visible = picked.length ? items.filter(i => pickedSet.has(i.id)) : items;

  // Kept in pick order (not list order), and tolerant of a picked row leaving
  // the list entirely — a refresh can drop a team or player from under us.
  const pickedItems = picked
    .map(id => items.find(i => i.id === id))
    .filter((i): i is T => Boolean(i));

  function pick(id: string) {
    setQuery("");
    setShowSuggestions(false);
    setPicked(prev => (prev.includes(id) ? prev : [...prev, id]));
  }

  function unpick(id: string) {
    setPicked(prev => prev.filter(p => p !== id));
  }

  function clearAll() {
    setPicked([]);
  }

  return {
    query, setQuery, q,
    showSuggestions, setShowSuggestions,
    suggestions, visible, picked, pickedItems,
    pick, unpick, clearAll,
  };
}
