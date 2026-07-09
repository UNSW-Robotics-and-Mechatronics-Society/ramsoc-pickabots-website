'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'

// Fallback floor used only before the container/content have been
// measured (e.g. the very first render) — see getMinScale for the real,
// per-content floor used everywhere else.
const MIN_SCALE = 0.4
const MAX_SCALE = 4
const LEFT_PADDING = 20
const TOP_PADDING  = 20
const WIDTH_PADDING = 0.96
// How much of a single match card should fill the viewport width when
// jumping straight to it (team filter) — enough to read clearly without
// feeling like a forced full-screen zoom.
const MATCH_VIEW_FRACTION = 0.34

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)) }

type Point = { x: number; y: number }
type Transform = { scale: number; x: number; y: number }

function dist(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y) }
function midpoint(a: Point, b: Point) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }

// Describes what the camera should frame by default (round-of-N buttons):
// `anchorEl` drives both placement axes — its top-left corner lands at
// (LEFT_PADDING, TOP_PADDING), so the round's topmost match is what's
// actually pinned to the top of the screen. Passing `extraWidth` reserves
// that many extra unscaled px alongside the anchor's own width so the next
// round's edge peeks into view.
export type FocusTarget = { anchorEl: HTMLElement; extraWidth?: number }

export type BracketZoomPanHandle = {
  /** Re-apply the default framing (round-of-N focus, or fit-to-view). */
  resetView: () => void
  /** Center the viewport on one specific match card at a readable zoom level. */
  focusOnMatch: (el: HTMLElement) => void
}

type Props = {
  children: ReactNode
  /**
   * Called to get the default framing target (instead of fitting the whole
   * bracket) — e.g. "jump to round R64's column, peeking at R32." Falls back
   * to fitting the whole content when this returns null/undefined. Re-read
   * whenever the observer re-fires, so a fresh `key` from the parent (see
   * below) makes clicking a different round re-frame immediately.
   */
  getFocusElement?: () => FocusTarget | null
}

/**
 * A pannable/zoomable canvas scoped to its own content — pinch/drag only
 * moves what's inside it, the rest of the page (header, filter tabs) stays
 * fixed. Built on the Pointer Events API so touch, mouse, and pen all share
 * one code path. Frames either a specific target (`getFocusElement`) or the
 * whole content on mount, unless the user has manually zoomed/panned since —
 * from there, normal pan/pinch/wheel interaction works exactly as usual.
 *
 * To reset the frame when the content changes shape entirely (e.g. switching
 * a filter tab, or jumping to a different round), pass a React `key` from
 * the parent — remounting is what resets it, rather than an internal effect
 * driving setState. `resetView` / `focusOnMatch` are exposed imperatively
 * (via ref) so the parent can drive the camera from controls that live
 * outside this component (the header's "Reset View" button, team search).
 */
const BracketZoomPan = forwardRef<BracketZoomPanHandle, Props>(function BracketZoomPan(
  { children, getFocusElement }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef   = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const pointers  = useRef(new Map<number, Point>())
  const pinch     = useRef<{ startDist: number; startMid: Point; start: Transform } | null>(null)
  const pan       = useRef<{ start: Point; startTransform: Transform } | null>(null)
  const interacted = useRef(false)
  // Read inside event handlers instead of closing over `transform` — those
  // handlers are recreated every render anyway, but imperative-handle
  // methods are captured once and must see the live value.
  const transformRef = useRef(transform)
  transformRef.current = transform

  // The max zoom-out: never let the content get any smaller than "the
  // whole thing fits the viewport" — going further out would just add
  // blank margin around already-fully-visible content. Content dimensions
  // (scrollWidth/Height) are the content's unscaled, intrinsic size — the
  // CSS transform: scale() doesn't affect them — so this is stable
  // regardless of the current zoom level. Capped at 1 so small content
  // (e.g. a single Finals box) isn't forced to zoom further IN than its
  // natural size just to "fill" the viewport.
  function getMinScale(): number {
    const container = containerRef.current
    const content   = contentRef.current
    if (!container || !content) return MIN_SCALE
    const cw = container.clientWidth
    const ch = container.clientHeight
    const contentW = content.scrollWidth
    const contentH = content.scrollHeight
    if (!cw || !ch || !contentW || !contentH) return MIN_SCALE
    return Math.min(cw / contentW, ch / contentH, 1)
  }

  // Keeps the content's own edges from ever being dragged/zoomed past the
  // viewport's edges — e.g. you can't pan down far enough to reveal blank
  // space above the top of the content (the "Winners Bracket" / "Ring 1"
  // header), nor past its other edges. When an axis's content is smaller
  // than the viewport, the valid range collapses to "somewhere between
  // flush-start and flush-end" instead of totally free — still bounded,
  // never further than the content's own natural extent.
  function clampTransform(t: Transform): Transform {
    const container = containerRef.current
    const content   = contentRef.current
    if (!container || !content) return t
    const cw = container.clientWidth
    const ch = container.clientHeight
    const contentW = content.scrollWidth  * t.scale
    const contentH = content.scrollHeight * t.scale
    if (!cw || !ch || !contentW || !contentH) return t
    const minX = Math.min(0, cw - contentW)
    const maxX = Math.max(0, cw - contentW)
    const minY = Math.min(0, ch - contentH)
    const maxY = Math.max(0, ch - contentH)
    return { scale: t.scale, x: clamp(t.x, minX, maxX), y: clamp(t.y, minY, maxY) }
  }

  // All transform updates — pinch, pan, wheel, and every programmatic
  // focus/fit — funnel through this instead of setTransform directly, so
  // the bound above is impossible to bypass.
  function setClampedTransform(next: Transform | ((prev: Transform) => Transform)) {
    setTransform(prev => clampTransform(typeof next === 'function' ? next(prev) : next))
  }

  function fitToView() {
    const container = containerRef.current
    const content   = contentRef.current
    if (!container || !content) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const contentW = content.scrollWidth
    const contentH = content.scrollHeight
    if (!cw || !ch || !contentW || !contentH) return
    const scale = clamp(Math.min(cw / contentW, ch / contentH, 1), getMinScale(), MAX_SCALE)
    setClampedTransform({
      scale,
      x: (cw - contentW * scale) / 2,
      y: (ch - contentH * scale) / 2,
    })
  }

  // Frame a round-of-N target: scaled so the anchor's width PLUS `extraWidth`
  // (a peek at the next round) fits the viewport, with the anchor itself —
  // the round's topmost match — pinned top-left to a fixed padding. Since
  // every round column shares the same width, this gives every round the
  // exact same scale and the exact same top/left anchor, so jumping from
  // one round to another only pans (never re-scales or re-anchors) — "the
  // top-left of round X lands where round Y did." Inverts whatever the
  // CURRENT transform is (works whether called at identity on mount or
  // later from "Reset View" after the user has panned/zoomed elsewhere).
  function focusOnTarget(target: FocusTarget) {
    const container = containerRef.current
    if (!container) return
    const t = transformRef.current
    const rect       = container.getBoundingClientRect()
    const anchorRect = target.anchorEl.getBoundingClientRect()
    const elLocalX = (anchorRect.left - rect.left - t.x) / t.scale
    const elLocalY = (anchorRect.top  - rect.top  - t.y) / t.scale
    const elLocalW = anchorRect.width / t.scale
    if (!elLocalW) return
    const cw = container.clientWidth
    const totalW = elLocalW + (target.extraWidth ?? 0)
    const scale = clamp((cw * WIDTH_PADDING) / totalW, getMinScale(), MAX_SCALE)
    setClampedTransform({ scale, x: LEFT_PADDING - elLocalX * scale, y: TOP_PADDING - elLocalY * scale })
  }

  // Center one specific match card in the viewport at a comfortable,
  // consistent zoom level — used by team-filter search, which needs an
  // arbitrary match anywhere in the bracket centered on screen rather than
  // pinned to a round's top-left.
  function focusOnMatch(el: HTMLElement) {
    const container = containerRef.current
    if (!container) return
    const t = transformRef.current
    const rect   = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const elLocalX = (elRect.left - rect.left - t.x) / t.scale
    const elLocalY = (elRect.top  - rect.top  - t.y) / t.scale
    const elLocalW = elRect.width  / t.scale
    const elLocalH = elRect.height / t.scale
    if (!elLocalW) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const scale = clamp((cw * MATCH_VIEW_FRACTION) / elLocalW, getMinScale(), MAX_SCALE)
    const centerX = elLocalX + elLocalW / 2
    const centerY = elLocalY + elLocalH / 2
    interacted.current = true
    setClampedTransform({ scale, x: cw / 2 - centerX * scale, y: ch / 2 - centerY * scale })
  }

  function applyDefaultView() {
    const target = getFocusElement?.()
    if (target) focusOnTarget(target)
    else fitToView()
  }

  useImperativeHandle(ref, () => ({
    resetView() { interacted.current = false; applyDefaultView() },
    focusOnMatch,
  }))

  // Apply the default view whenever the container or content resizes —
  // ResizeObserver fires once asynchronously right after observe() with the
  // initial size, which is what covers the "on mount" case without calling
  // setState synchronously inside the effect body itself. Stops once the
  // user takes over (pinch/drag/wheel/focusOnMatch) — see the `key` note
  // above for how a fresh default (e.g. a different round) gets applied
  // instead.
  useEffect(() => {
    const container = containerRef.current
    const content   = contentRef.current
    if (!container || !content) return
    const ro = new ResizeObserver(() => { if (!interacted.current) applyDefaultView() })
    ro.observe(container)
    ro.observe(content)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    interacted.current = true;
    (e.target as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()]
      pinch.current = { startDist: dist(pts[0], pts[1]), startMid: midpoint(pts[0], pts[1]), start: transform }
      pan.current = null
    } else if (pointers.current.size === 1) {
      pan.current = { start: { x: e.clientX, y: e.clientY }, startTransform: transform }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    if (pointers.current.size === 2 && pinch.current) {
      const pts = [...pointers.current.values()]
      const newDist = dist(pts[0], pts[1])
      const mid     = midpoint(pts[0], pts[1])
      const { startDist, startMid, start } = pinch.current
      const newScale = clamp(start.scale * (newDist / startDist), getMinScale(), MAX_SCALE)
      // Keep the content point that was under the pinch's starting midpoint
      // anchored under the (possibly moved) current midpoint.
      const cx = (startMid.x - rect.left - start.x) / start.scale
      const cy = (startMid.y - rect.top  - start.y) / start.scale
      setClampedTransform({
        scale: newScale,
        x: (mid.x - rect.left) - cx * newScale,
        y: (mid.y - rect.top)  - cy * newScale,
      })
    } else if (pointers.current.size === 1 && pan.current) {
      // Capture everything needed from the ref now — setTransform's updater
      // can run later (React may invoke it more than once, e.g. Strict Mode),
      // by which point another event could have already mutated pan.current.
      const { start, startTransform } = pan.current
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      setClampedTransform({ ...startTransform, x: startTransform.x + dx, y: startTransform.y + dy })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 1) {
      const [[, p]] = pointers.current
      pan.current = { start: p, startTransform: transform }
    } else {
      pan.current = null
    }
  }

  function onWheel(e: React.WheelEvent) {
    interacted.current = true
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const newScale = clamp(transform.scale * (1 - e.deltaY * 0.001), getMinScale(), MAX_SCALE)
    const cx = (e.clientX - rect.left - transform.x) / transform.scale
    const cy = (e.clientY - rect.top  - transform.y) / transform.scale
    setClampedTransform({
      scale: newScale,
      x: (e.clientX - rect.left) - cx * newScale,
      y: (e.clientY - rect.top)  - cy * newScale,
    })
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      style={{
        touchAction: 'none', overflow: 'hidden', position: 'relative',
        width: '100%', height: '100%', cursor: 'grab',
      }}
    >
      <div ref={contentRef} style={{
        width: 'max-content',
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        transformOrigin: '0 0',
      }}>
        {children}
      </div>
    </div>
  )
})

export default BracketZoomPan
