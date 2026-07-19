import { type BracketMatch, winner } from '@/lib/mock-data'

// ── layout constants — shared by the bracket tree (BracketPage) and the
// read-only schedule view (MatchList); mirrors the admin bracket's column
// layout, just at half its size. Kept here (not per-consumer) so both stay
// pixel-identical without copy-pasting.
export const MATCH_H  = 54
export const ROUND_W  = 84
export const CONN_W   = 20
export const SLOT_H   = MATCH_H + 7

export const STATUS_LABEL: Record<BracketMatch['status'], string> = {
  todo: '· · ·', next: 'NEXT', active: '● LIVE', completed: '✓ DONE', skipped: 'SKIP',
}
// active = green (in progress), completed = grey (done, faded out), skipped
// = red, next = yellow (on deck), todo = neutral/dim (not yet reached).
export const STATUS_COLOR: Record<BracketMatch['status'], string> = {
  todo: 'rgba(255,255,255,0.25)', next: '#FFD700', active: '#4ADE80',
  completed: 'rgba(255,255,255,0.4)', skipped: 'rgba(255,80,80,0.7)',
}
export const STATUS_BORDER: Record<BracketMatch['status'], string> = {
  todo: 'rgba(255,255,255,0.14)', next: 'rgba(255,215,0,0.5)', active: 'rgba(74,222,128,0.7)',
  completed: 'rgba(255,255,255,0.16)', skipped: 'rgba(255,80,80,0.6)',
}

export const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

export function matchSideLabel(m: BracketMatch): string {
  if (m.side === 'finals-semi')  return `Semi ${m.matchNumber}`
  if (m.side === 'finals-third') return '3rd Place'
  if (m.side === 'finals-final') return 'Grand Final'
  if (m.side === 'exhibition')   return 'Exhibition'
  return `${m.side === 'winners' ? 'W' : 'L'}B R${m.round}`
}

export function Slot({ name, score, won, lost, placeholder }: { name: string; score: number; won: boolean; lost: boolean; placeholder?: string }) {
  const empty = !name
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flex: 1, padding: '0 5px',
      background: won ? 'rgba(255,107,0,0.14)' : 'transparent',
    }}>
      <span style={{
        fontSize: '0.31rem', fontWeight: 900, letterSpacing: 0.25, textTransform: 'uppercase',
        // Empty slots show their feeder ("Winner of R64 M3") in a dimmer,
        // italic style so it reads as a placeholder, not a real team.
        color: empty ? 'rgba(200,200,200,0.5)' : won ? '#fff' : lost ? 'rgba(255,255,255,0.3)' : 'rgba(210,210,210,0.85)',
        fontStyle: empty ? 'italic' : 'normal',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {name || placeholder || 'TBD'}
      </span>
      <span style={{ fontSize: '0.34rem', fontWeight: 900, color: won ? '#FF6B00' : 'rgba(255,255,255,0.35)' }}>
        {score}
      </span>
    </div>
  )
}

type MatchCardProps = {
  match: BracketMatch
  /** Formatted scheduled time (e.g. "1:05 PM"). Omitted → the time row is not rendered at all. */
  time?: string
  dimmed?: boolean
  /**
   * Highlighted because one of its teams is in the active team filter. Renders
   * a solid light card with a status-coloured border (grey = done, black =
   * to-do), overriding the normal "done → faded" treatment. Wins over `dimmed`.
   */
  selected?: boolean
  /** Feeder placeholders for empty slots (e.g. { a: "Winner of R64 M3" }). */
  defaults?: { a?: string; b?: string }
}

export function MatchCard({ match, time, dimmed, selected, defaults }: MatchCardProps) {
  const w = winner(match)
  const isDone = match.status === 'completed'

  // Selected (filtered-in) cards keep the normal dark look but render SOLID —
  // never faded, even when done — with a status border so a followed team's
  // matches stand out: light grey when done, black when still to do. (Black is
  // intentionally subtle on the dark theme.)
  const border = selected
    ? `2px solid ${isDone ? '#9ca3af' : '#000'}`
    : `1px solid ${STATUS_BORDER[match.status]}`

  return (
    <div style={{
      height: MATCH_H, width: ROUND_W, flexShrink: 0, position: 'relative',
      display: 'flex', flexDirection: 'column',
      // Opaque (no backdrop-blur): keeps cards crisp when the bracket is
      // scaled up, and lets them read cleanly on top of the translucent
      // Winners/Losers box instead of blending it through.
      background: 'rgba(6,3,16,0.96)',
      border,
      borderRadius: 5, overflow: 'hidden',
      boxShadow: match.status === 'active' ? '0 0 10px rgba(74,222,128,0.3)' : '0 1.5px 7px rgba(0,0,0,0.5)',
      // Team-filter dimming and "done → grey" both fade the card out; a
      // selected card is never faded, and dimming wins over done.
      opacity: selected ? 1 : dimmed ? 0.22 : isDone ? 0.55 : 1,
      filter: selected ? 'none' : dimmed ? 'grayscale(0.6)' : isDone ? 'grayscale(0.85)' : 'none',
      transition: 'opacity 0.2s, filter 0.2s',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: GRAIN, backgroundSize: '70px 70px', opacity: 0.05,
      }} />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1.5px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.2rem', fontWeight: 900, letterSpacing: 0.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          {matchSideLabel(match)}
        </span>
        <span style={{ fontSize: '0.2rem', fontWeight: 900, letterSpacing: 0.5, color: STATUS_COLOR[match.status] }}>
          {STATUS_LABEL[match.status]}
        </span>
      </div>
      {time !== undefined && (
        <div style={{
          flexShrink: 0, textAlign: 'center', padding: '1px 0',
          fontSize: '0.22rem', fontWeight: 700, letterSpacing: 0.5,
          color: 'rgba(255,215,0,0.65)', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {time}
        </div>
      )}
      <Slot name={match.slotA.teamName} score={match.slotA.score} won={w === 'a'} lost={w === 'b'} placeholder={defaults?.a} />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <Slot name={match.slotB.teamName} score={match.slotB.score} won={w === 'b'} lost={w === 'a'} placeholder={defaults?.b} />
    </div>
  )
}
