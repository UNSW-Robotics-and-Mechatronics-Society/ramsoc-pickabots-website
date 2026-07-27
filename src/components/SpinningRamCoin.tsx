'use client'
import { useId } from 'react'

// A real 3D RAMSoc coin that rotates continuously — used in the voting header
// in place of the old flat disc that merely flipped via a 2D rotateY. Built with
// the same pure-CSS 3D technique as the big CoinModal: two emblem faces plus a
// ring of thin panels forming a milled edge, all inside a `preserve-3d` group
// with a small perspective, so as it spins you actually see the coin's
// thickness turn edge-on rather than a picture flipping. No WebGL, no re-renders
// — the spin is a single CSS keyframe animation (paused under reduced-motion).
//
// The inline flat <RamCoin> is still used wherever the RamC currency appears in
// running text; this heavier component is reserved for the one hero coin.

const FACE_GRADIENT =
  'radial-gradient(circle at 34% 26%, #6EA0F0 0%, #2C6BD0 34%, #1353AF 60%, #0A2E57 100%)'
const EDGE_LIGHT = '#3F7AD8'
const EDGE_DARK = '#0A2E57'
const REST_TILT = -14 // constant forward tilt so the coin never looks perfectly flat

export default function SpinningRamCoin({
  size = 22,
  segments = 32,
  spinSeconds = 5,
  onClick,
  title,
}: {
  size?: number
  /** panels around the rim — denser reads as finer milling */
  segments?: number
  /** seconds for one full turn */
  spinSeconds?: number
  onClick?: () => void
  title?: string
}) {
  const interactive = !!onClick
  const thickness = Math.max(3, Math.round(size * 0.18))
  const radius = size / 2
  const step = 360 / segments
  const arc = (Math.PI * size) / segments + 1 // panel height (+ overlap to hide seams)
  const emblem = Math.round(size * 0.62)
  const spinName = `ramcoin3dSpin-${useId().replace(/:/g, '')}`

  const emblemStyle = {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    width: emblem,
    height: emblem,
    transform: 'translate(-50%,-50%)',
    backgroundColor: '#EAF2FF',
    WebkitMaskImage: 'url(/ramsoc_logo.svg)',
    maskImage: 'url(/ramsoc_logo.svg)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    pointerEvents: 'none' as const,
  }

  const face = (back: boolean) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        background: FACE_GRADIENT,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: `${back ? 'rotateY(180deg) ' : ''}translateZ(${thickness / 2}px)`,
        boxShadow: `inset 0 0 0 ${Math.max(1, size * 0.09)}px rgba(255,255,255,0.2), inset 0 0 ${size * 0.5}px rgba(0,0,0,0.4)`,
      }}
    >
      <div style={emblemStyle} />
      {/* Fixed top-left highlight — the "light source". */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.12) 22%, transparent 46%)',
        }}
      />
    </div>
  )

  return (
    <span
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? title ?? 'Open coin' : undefined}
      aria-hidden={interactive ? undefined : true}
      title={title}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        verticalAlign: 'middle',
        width: size,
        height: size,
        perspective: size * 7,
        perspectiveOrigin: 'center',
        cursor: interactive ? 'pointer' : undefined,
        // A soft cast glow beneath the coin. Kept on this (perspective) element —
        // `filter` on the preserve-3d group below would collapse it to flat.
        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45)) drop-shadow(0 0 6px rgba(41,110,220,0.35))',
      }}
    >
      <span
        className={spinName}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: `rotateX(${REST_TILT}deg) rotateY(0deg)`,
          animation: `${spinName} ${spinSeconds}s linear infinite`,
        }}
      >
        {face(false)}
        {face(true)}

        {/* Milled edge: `segments` panels wrapped into a cylinder whose axis is
            the coin's face normal — each panel spans the thickness (width) and
            one arc slice (height); the per-panel gradient reads as a ridge. */}
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: thickness,
              height: arc,
              marginLeft: -thickness / 2,
              marginTop: -arc / 2,
              transform: `rotateZ(${i * step}deg) translateX(${radius}px) rotateY(90deg)`,
              background: `linear-gradient(to bottom, ${EDGE_DARK} 0%, ${EDGE_LIGHT} 50%, ${EDGE_DARK} 100%)`,
            }}
          />
        ))}
      </span>

      <style>{`
        @keyframes ${spinName} {
          from { transform: rotateX(${REST_TILT}deg) rotateY(0deg); }
          to   { transform: rotateX(${REST_TILT}deg) rotateY(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .${spinName} { animation: none !important; }
        }
      `}</style>
    </span>
  )
}
