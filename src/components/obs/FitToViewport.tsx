'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Scales its child DOWN (never up) so it always fits the browser-source
 * viewport. The bracket overlay's natural width grows with team count /
 * round count, and OBS sources are a fixed pixel size — this keeps the whole
 * tree on screen at any bracket size instead of cropping the late rounds.
 */
export default function FitToViewport({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = inner.current
    if (!el) return
    const fit = () => {
      // scrollWidth/Height = the content's natural (unscaled) size.
      const s = Math.min(
        1,
        window.innerWidth / Math.max(1, el.scrollWidth),
        window.innerHeight / Math.max(1, el.scrollHeight),
      )
      setScale(s)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        {children}
      </div>
    </div>
  )
}
