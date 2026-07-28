// Which match results this player has already been shown the win/loss screen
// for. The screen only exists on the bidding page, so a match that resolves
// while the player is on the leaderboard (or has the app closed) would
// otherwise pass by unseen — VotePage replays anything unacknowledged on its
// next load and records it here.
//
// Keyed by MATCH id, not vote id: there's exactly one vote per player per match
// (a DB unique constraint), so the match identifies the result, and it's known
// immediately — a vote that's still in flight doesn't have a real id yet.
//
// localStorage, so it survives reloads. Per-device by design: this is
// "have I shown you this yet", not durable state worth a DB column.

const KEY = 'pickabots_seen_results'
/** Cap the list so it can't grow without bound over a long event. */
const MAX = 200

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export function hasSeenResult(matchId: string): boolean {
  if (typeof window === 'undefined') return false
  return read().includes(matchId)
}

export function markResultsSeen(matchIds: string[]): void {
  if (typeof window === 'undefined' || matchIds.length === 0) return
  try {
    const fresh = new Set(matchIds)
    const next = [...read().filter(id => !fresh.has(id)), ...matchIds].slice(-MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode / quota — replaying a result twice is a far smaller problem
    // than failing the page load, so this is deliberately swallowed.
  }
}
