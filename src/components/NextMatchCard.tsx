'use client'
import type { CSSProperties } from 'react'
import BotSvg from './BotSvg'
import { COMP_META } from './Ring'
import type { Match } from '@/lib/types'

/**
 * A small, read-only preview of an upcoming (not-yet-active) match — no
 * voting, no hover effects, deliberately more transparent than a live Ring
 * so it reads as "coming up" rather than "biddable right now".
 *
 * Each team (icon + name) is still clickable to open its team-info ledger,
 * mirroring the info affordance on a live Ring — pass `onTeamClick`.
 */
export default function NextMatchCard({ match, onTeamClick }: { match: Match; onTeamClick?: (name: string) => void }) {
  // Same override as Ring.tsx — an exhibition match's identity shouldn't
  // depend on which division's bracket it was created under.
  const meta = match.is_exhibition ? COMP_META.exhibition : (COMP_META[match.comp_type] ?? COMP_META.standard)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      borderRadius: 10, padding: '8px 12px',
      border: `1px solid color-mix(in srgb, ${meta.color} 20%, transparent)`,
      background: 'rgba(10,6,28,0.55)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <Bot name={match.left_name} color={match.left_color} shape={match.left_shape}
           onClick={onTeamClick && (() => onTeamClick(match.left_name))} />

      <div style={{
        fontSize: '0.55rem', fontWeight: 900, color: 'rgba(255,255,255,0.3)',
        flexShrink: 0,
      }}>
        VS
      </div>

      <Bot name={match.right_name} color={match.right_color} shape={match.right_shape} align="right"
           onClick={onTeamClick && (() => onTeamClick(match.right_name))} />

      <div style={{
        flexShrink: 0, fontSize: '0.42rem', fontWeight: 900,
        textTransform: 'uppercase', letterSpacing: 2, color: meta.color,
      }}>
        {/* Round included for finals — same reason as Ring's badge. */}
        {match.finals_label ? `${meta.label} · ${match.finals_label}` : meta.label}
      </div>
    </div>
  )
}

function Bot({ name, color, shape, align = 'left', onClick }: { name: string; color: string; shape: string; align?: 'left' | 'right'; onClick?: (() => void) | false }) {
  const layout: CSSProperties = {
    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
    flexDirection: align === 'right' ? 'row-reverse' : 'row',
  }
  const inner = (
    <>
      <div style={{ width: 26, height: 26, flexShrink: 0 }}>
        <BotSvg shape={shape} color={color} />
      </div>
      <span style={{
        fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1,
        color: 'rgba(220,220,220,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        textAlign: align,
      }}>
        {name}
      </span>
    </>
  )

  if (!onClick) return <div style={layout}>{inner}</div>

  // Clickable team → opens the team-info ledger. Reset the button's native
  // chrome so it looks identical to the read-only variant, just interactive.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${name} stats`}
      style={{
        ...layout,
        appearance: 'none', background: 'none', border: 'none', padding: 0, margin: 0,
        font: 'inherit', color: 'inherit', cursor: 'pointer',
      }}
    >
      {inner}
    </button>
  )
}
