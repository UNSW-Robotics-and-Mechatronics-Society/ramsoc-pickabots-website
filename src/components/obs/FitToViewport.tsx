'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Scales its child DOWN (never up) so it always fits the browser-source
 * viewport — the bracket overlay's natural width grows with team count, and
 * OBS sources are a fixed pixel size.
 *
 * Also interactive, for OBS's right-click → Interact window (and any normal
 * browser): drag to pan, scroll wheel to zoom (anchored to centre), double-
 * click to reset to the auto fit. The auto-fit is the resting state — a
 * refresh or reset always returns to "everything visible".
 */
export default function FitToViewport({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  useEffect(() => {
    const el = inner.current
    if (!el) return
    const doFit = () => {
      // scrollWidth/Height = the content's natural (unscaled) size.
      setFit(Math.min(
        1,
        window.innerWidth / Math.max(1, el.scrollWidth),
        window.innerHeight / Math.max(1, el.scrollHeight),
      ))
    }
    doFit()
    const ro = new ResizeObserver(doFit)
    ro.observe(el)
    window.addEventListener('resize', doFit)
    return () => { ro.disconnect(); window.removeEventListener('resize', doFit) }
  }, [])

  return (
    <div
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: drag.current ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={e => {
        drag.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        if (!drag.current) return
        setOffset({
          x: drag.current.baseX + (e.clientX - drag.current.startX),
          y: drag.current.baseY + (e.clientY - drag.current.startY),
        })
      }}
      onPointerUp={() => { drag.current = null }}
      onPointerCancel={() => { drag.current = null }}
      onWheel={e => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
        setZoom(z => Math.min(5, Math.max(0.5, z * factor)))
      }}
      onDoubleClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}
    >
      <div
        ref={inner}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${fit * zoom})`,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  )
}
