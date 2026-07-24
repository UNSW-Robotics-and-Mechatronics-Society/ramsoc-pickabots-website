'use client'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

// The RAMSoc coin, blown up to the middle of the screen as a real 3D object
// you can grab and spin. Built entirely from CSS 3D transforms (no WebGL): two
// emblem faces plus a ring of thin panels forming a milled edge, all inside a
// `preserve-3d` group whose rotateX/rotateY is driven imperatively (via a ref +
// rAF) so spinning never re-renders React. A flick imparts inertia that decays
// into a slow idle spin; an animated specular streak gives the polished-metal
// shine. Rendered through a portal like the app's other modals.

// Blue face + edge palette (RAMSoc royal blue #1353AF).
const FACE_GRADIENT =
  'radial-gradient(circle at 34% 26%, #6EA0F0 0%, #2C6BD0 34%, #1353AF 60%, #0A2E57 100%)'
const EDGE_LIGHT = '#3F7AD8'
const EDGE_DARK = '#0A2E57'

const EDGE_SEGMENTS = 100 // panels around the rim — dense enough to read as milling
const THICKNESS = 26 // coin depth in px
const IDLE_SPIN = 0.32 // deg/frame the coin drifts at when left alone (~19°/s)
const DRAG_SENS = 0.4 // deg of rotation per px dragged
const REST_TILT = -14 // gentle forward tilt so the coin never looks perfectly flat

function computeDiameter() {
  if (typeof window === 'undefined') return 320
  return Math.min(window.innerWidth * 0.72, window.innerHeight * 0.62, 360)
}

const emblemStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: '60%',
  height: '60%',
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
  filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
  pointerEvents: 'none',
}

function Face({ back }: { back?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        background: FACE_GRADIENT,
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        // Push each face out to its side of the coin body.
        transform: `${back ? 'rotateY(180deg) ' : ''}translateZ(${THICKNESS / 2}px)`,
        boxShadow:
          'inset 0 0 0 10px rgba(255,255,255,0.2), inset 0 0 46px rgba(0,0,0,0.4)',
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
      {/* Moving specular streak — the shine sweeping across the metal. */}
      <div
        style={{
          position: 'absolute',
          top: '-30%',
          left: '-60%',
          width: '80%',
          height: '160%',
          pointerEvents: 'none',
          background:
            'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.4) 48%, rgba(255,255,255,0.08) 56%, transparent 72%)',
          mixBlendMode: 'screen',
          animation: 'coinSheen 3.6s ease-in-out infinite',
        }}
      />
    </div>
  )
}

export default function CoinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const coinRef = useRef<HTMLDivElement>(null)
  const rot = useRef({ x: REST_TILT, y: 0 })
  const vel = useRef({ x: 0, y: IDLE_SPIN })
  const dragging = useRef(false)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const reduceMotion = useRef(false)
  const [diameter, setDiameter] = useState(computeDiameter)

  // Keep the coin sized to the viewport (recompute on resize/rotate).
  useEffect(() => {
    if (!open) return
    const onResize = () => setDiameter(computeDiameter())
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  // Body scroll lock while open, matching the other modals.
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // The spin loop: drives the coin's transform every frame. While dragging,
  // the pointer sets rotation directly; otherwise velocity carries it (inertia)
  // and relaxes toward a slow idle spin about Y with the tilt easing back to
  // rest, so a flick glides to a graceful turntable rather than stopping dead.
  useEffect(() => {
    if (!open) return
    reduceMotion.current =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Reset pose each time it opens.
    rot.current = { x: REST_TILT, y: 0 }
    vel.current = { x: 0, y: reduceMotion.current ? 0 : IDLE_SPIN }

    let raf = 0
    const apply = () => {
      const el = coinRef.current
      if (el) el.style.transform = `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`
    }
    const frame = () => {
      if (!dragging.current) {
        rot.current.x += vel.current.x
        rot.current.y += vel.current.y
        // Ease velocity: vertical tumble decays to zero, horizontal spin
        // settles to the idle rate.
        const idle = reduceMotion.current ? 0 : IDLE_SPIN
        vel.current.x += (0 - vel.current.x) * 0.06
        vel.current.y += (idle - vel.current.y) * 0.06
        // Once nearly idle, ease the tilt back to rest.
        if (Math.abs(vel.current.x) < 0.05) {
          rot.current.x += (REST_TILT - rot.current.x) * 0.04
        }
      }
      apply()
      raf = requestAnimationFrame(frame)
    }
    apply()
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [open])

  if (!open || typeof document === 'undefined') return null

  const onPointerDown = (e: ReactPointerEvent) => {
    dragging.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }
    vel.current = { x: 0, y: 0 }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current || !lastPointer.current) return
    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    lastPointer.current = { x: e.clientX, y: e.clientY }
    rot.current.y += dx * DRAG_SENS
    rot.current.x -= dy * DRAG_SENS
    // Remember the latest motion so releasing hands off into inertia.
    vel.current = { x: -dy * DRAG_SENS, y: dx * DRAG_SENS }
    const el = coinRef.current
    if (el) el.style.transform = `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`
  }
  const endDrag = () => {
    dragging.current = false
    lastPointer.current = null
  }

  const radius = diameter / 2
  const step = 360 / EDGE_SEGMENTS
  const arc = (Math.PI * diameter) / EDGE_SEGMENTS + 2 // panel height (+ overlap)

  return createPortal(
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background:
          'radial-gradient(ellipse at center, rgba(6,14,34,0.82) 0%, rgba(0,0,6,0.9) 100%)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          right: 16,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.14)',
          color: '#cfe0ff',
          width: 38,
          height: 38,
          borderRadius: '50%',
          fontSize: '1rem',
          fontWeight: 900,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1,
        }}
      >
        ✕
      </button>

      {/* Pop-in wrapper: scales/fades the whole scene up from the centre. */}
      <div
        style={{
          animation: 'coinPop 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 22,
        }}
      >
        {/* Perspective stage — the drag surface. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            width: diameter,
            height: diameter,
            perspective: 1100,
            perspectiveOrigin: 'center',
            cursor: 'grab',
            touchAction: 'none',
            // Soft cast shadow / glow beneath the coin. Kept HERE, on the
            // perspective element, not on the preserve-3d coin below — `filter`
            // forces transform-style to `flat`, which would collapse the 3D.
            filter:
              'drop-shadow(0 24px 40px rgba(0,0,0,0.55)) drop-shadow(0 0 30px rgba(41,110,220,0.35))',
          }}
        >
          <div
            ref={coinRef}
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              transformStyle: 'preserve-3d',
              transform: `rotateX(${REST_TILT}deg) rotateY(0deg)`,
            }}
          >
            <Face />
            <Face back />

            {/* Milled edge: EDGE_SEGMENTS panels wrapped into a cylinder whose
                axis is the coin's face normal. Each panel spans the thickness
                (width) and one arc slice (height); the per-panel gradient makes
                each read as a rounded ridge. */}
            {Array.from({ length: EDGE_SEGMENTS }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: THICKNESS,
                  height: arc,
                  marginLeft: -THICKNESS / 2,
                  marginTop: -arc / 2,
                  transform: `rotateZ(${i * step}deg) translateX(${radius}px) rotateY(90deg)`,
                  background: `linear-gradient(to bottom, ${EDGE_DARK} 0%, ${EDGE_LIGHT} 50%, ${EDGE_DARK} 100%)`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Label / hint */}
        <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 900,
              letterSpacing: 4,
              color: '#EAF2FF',
              textTransform: 'uppercase',
              textShadow: '0 0 18px rgba(41,110,220,0.7)',
            }}
          >
            RAMSoc Coin
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: '0.5rem',
              fontWeight: 900,
              letterSpacing: 3,
              color: 'rgba(180,205,255,0.55)',
              textTransform: 'uppercase',
            }}
          >
            ◆ Drag to spin ◆
          </div>
        </div>
      </div>

      <style>{`
        @keyframes coinPop {
          from { transform: scale(0.25); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
        @keyframes coinSheen {
          0%   { transform: translateX(0);     opacity: 0; }
          45%  { opacity: 1; }
          100% { transform: translateX(230%);  opacity: 0; }
        }
      `}</style>
    </div>,
    document.body,
  )
}
