'use client'
import type { CSSProperties } from 'react'

// RAMSoc-blue token coin bearing the RAMSoc emblem. The emblem is the shared
// /ramsoc_logo.svg (a white mark), tinted via a CSS mask so it stays crisp at
// any size and lives in exactly one place. Used inline wherever the RC
// currency is shown. Pass `onClick` to make a coin interactive — the header
// balance coin does this to open the expandable 3D coin (see CoinModal).
export default function RamCoin({
  size = 20,
  style,
  onClick,
  title,
}: {
  size?: number
  style?: CSSProperties
  onClick?: () => void
  title?: string
}) {
  const emblem = Math.round(size * 0.66)
  const interactive = !!onClick

  return (
    <span
      onClick={onClick}
      title={title}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? title ?? 'Open coin' : undefined}
      aria-hidden={interactive ? undefined : true}
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        verticalAlign: 'middle',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        // Blue face: a bright glint top-left falling to a deep rim.
        background:
          'radial-gradient(circle at 35% 28%, #5B90E8 0%, #1E5FC0 42%, #1353AF 66%, #0A2E57 100%)',
        // Raised rim + top glint + lower inner shadow — a struck-metal look.
        boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.055)}px rgba(255,255,255,0.22), inset 0 ${size * 0.14}px ${size * 0.2}px rgba(255,255,255,0.16), inset 0 -${size * 0.16}px ${size * 0.22}px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.4)`,
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
    >
      <span
        style={{
          width: emblem,
          height: emblem,
          backgroundColor: '#EAF2FF',
          WebkitMaskImage: 'url(/ramsoc_logo.svg)',
          maskImage: 'url(/ramsoc_logo.svg)',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    </span>
  )
}
