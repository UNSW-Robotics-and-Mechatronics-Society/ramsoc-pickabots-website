'use client'
import BotSvg from './BotSvg'
import { COMP_META } from './Ring'
import type { Match } from '@/lib/types'

/**
 * A small, read-only preview of an upcoming (not-yet-active) match — no
 * voting, no hover effects, deliberately more transparent than a live Ring
 * so it reads as "coming up" rather than "biddable right now".
 */
export default function NextMatchCard({ match }: { match: Match }) {
  const meta = COMP_META[match.comp_type] ?? COMP_META.standard

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      borderRadius: 10, padding: '8px 12px',
      border: `1px solid color-mix(in srgb, ${meta.color} 20%, transparent)`,
      background: 'rgba(3,1,8,0.14)',
      opacity: 0.6,
    }}>
      <Bot name={match.left_name} color={match.left_color} shape={match.left_shape} />

      <div style={{
        fontSize: '0.55rem', fontWeight: 900, color: 'rgba(255,255,255,0.3)',
        flexShrink: 0,
      }}>
        VS
      </div>

      <Bot name={match.right_name} color={match.right_color} shape={match.right_shape} align="right" />

      <div style={{
        flexShrink: 0, fontSize: '0.42rem', fontWeight: 900,
        textTransform: 'uppercase', letterSpacing: 2, color: meta.color,
      }}>
        {meta.label}
      </div>
    </div>
  )
}

function Bot({ name, color, shape, align = 'left' }: { name: string; color: string; shape: string; align?: 'left' | 'right' }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
      flexDirection: align === 'right' ? 'row-reverse' : 'row',
    }}>
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
    </div>
  )
}
