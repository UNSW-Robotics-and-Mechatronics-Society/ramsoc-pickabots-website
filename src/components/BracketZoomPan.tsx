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
// Momentum (kinetic) panning — after a flick-and-release the content keeps
// gliding and decelerates, instead of stopping dead the instant the finger
// lifts. Velocities are in screen px/ms (the translate axes are screen px,
// applied before scale), so they map straight onto the transform.
// FRICTION is the per-16.7ms-frame velocity decay; 0.95 gives a natural
// ~1s glide. A flick slower than MIN_FLICK_VELOCITY is treated as a plain
// release (no glide); the loop ends once velocity drops below MIN_STOP_VELOCITY.
const MOMENTUM_FRICTION    = 0.95
const MIN_FLICK_VELOCITY   = 0.05
const MIN_STOP_VELOCITY    = 0.01
// How much of a single match card should fill the viewport width when
// jumping straight to it (team filter) — enough to read clearly without
// feeling like a forced full-screen zoom.
const MATCH_VIEW_FRACTION = 0.34
// Pointer travel (screen px) that separates a tap from a drag. Below it we
// never grab the pointer onto the container — so a tap's click still lands on
// the team name it started on (opening the team info). Past it the gesture is
// a real pan, and we capture for robustness (see onPointerMove / onPointerDown).
const DRAG_THRESHOLD = 8

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
  /**
   * Which axis the max-zoom-out floor is measured against. 'both' (default,
   * used by the bracket) never lets either edge overflow the viewport —
   * right for content whose height is comparable to its width. 'width'
   * (used by the match list) floors zoom-out at "columns fill the screen
   * width" only, ignoring how tall the content is — for a schedule that's
   * naturally much taller than wide, 'both' would force zooming out until
   * the whole thing (many screens' worth of rows) fits, shrinking the
   * columns to unreadable; 'width' keeps columns at a readable size and
   * lets height overflow for panning instead.
   */
  fitAxis?: 'both' | 'width'
  /**
   * Opt into momentum (kinetic) panning: a flick-and-release keeps gliding
   * and decelerates rather than stopping the instant the pointer lifts. Off
   * by default so the bracket page keeps its exact-stop behaviour; the match
   * list (a tall, flick-scrolled schedule) turns it on.
   */
  momentum?: boolean
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
  { children, getFocusElement, fitAxis = 'both', momentum = false }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef   = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const pointers  = useRef(new Map<number, Point>())
  const pinch     = useRef<{ startDist: number; startMid: Point; start: Transform } | null>(null)
  const pan       = useRef<{ start: Point; startTransform: Transform } | null>(null)
  const interacted = useRef(false)
  // Momentum-panning state: the in-flight rAF handle, the flick velocity
  // (screen px/ms) built up during the drag, and the previous pointer sample
  // used to derive it. See startMomentum / MOMENTUM_FRICTION.
  const momentumRaf   = useRef<number | null>(null)
  const panVelocity   = useRef<Point>({ x: 0, y: 0 })
  const lastPanSample = useRef<{ x: number; y: number; t: number } | null>(null)
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
    return fitAxis === 'width'
      ? Math.min(cw / contentW, 1)
      : Math.min(cw / contentW, ch / contentH, 1)
  }

  // Keeps the content's own edges from ever being dragged/zoomed past the
  // viewport's edges. Per axis: when the content OVERFLOWS that axis, allow
  // panning across it (top/left-anchored range, so the earliest content —
  // the "Winners Bracket" / "Ring 1" header, the first time slot — is what
  // you start on and any hidden content is revealed by panning toward it).
  // When the content instead has SLACK on an axis (it's smaller than the
  // viewport there — e.g. a fully-fit bracket at max zoom-out), CENTER it in
  // that slack rather than jamming it into the top-left corner: there's
  // nothing to reveal by panning once everything fits, so a balanced, centered
  // frame reads far better than the content hugging one edge with all the
  // empty space dumped on the opposite side. Applies to both fitAxis modes.
  function clampTransform(t: Transform): Transform {
    const container = containerRef.current
    const content   = contentRef.current
    if (!container || !content) return t
    const cw = container.clientWidth
    const ch = container.clientHeight
    const contentW = content.scrollWidth  * t.scale
    const contentH = content.scrollHeight * t.scale
    if (!cw || !ch || !contentW || !contentH) return t
    const hSlack = cw - contentW
    const vSlack = ch - contentH
    const minX = hSlack < 0 ? hSlack : hSlack / 2
    const maxX = hSlack < 0 ? 0      : hSlack / 2
    const minY = vSlack < 0 ? vSlack : vSlack / 2
    const maxY = vSlack < 0 ? 0      : vSlack / 2
    return { scale: t.scale, x: clamp(t.x, minX, maxX), y: clamp(t.y, minY, maxY) }
  }

  // All transform updates — pinch, pan, wheel, and every programmatic
  // focus/fit — funnel through this instead of setTransform directly, so
  // the bound above is impossible to bypass.
  function setClampedTransform(next: Transform | ((prev: Transform) => Transform)) {
    setTransform(prev => clampTransform(typeof next === 'function' ? next(prev) : next))
  }

  // Halt any in-flight glide. Called before every fresh interaction (a new
  // touch, wheel, or programmatic camera move) so momentum never fights the
  // user or a reset/focus jump.
  function stopMomentum() {
    if (momentumRaf.current !== null) {
      cancelAnimationFrame(momentumRaf.current)
      momentumRaf.current = null
    }
  }

  // Grab every active pointer onto the CONTAINER (idempotent). Capturing on the
  // stable container rather than the child node under the pointer is what lets
  // a drag survive a live re-render (useRealtimeRefresh) swapping out the match
  // card the gesture started on — that node's (implicit) capture would be lost
  // when it unmounts, freezing the gesture. Only ever called once a gesture is
  // confirmed as a drag/pinch, never on a plain tap, so team-name clicks keep
  // firing on the element they belong to.
  function captureToContainer() {
    const c = containerRef.current
    if (!c) return
    for (const id of pointers.current.keys()) {
      if (!c.hasPointerCapture(id)) {
        try { c.setPointerCapture(id) } catch { /* pointer no longer active */ }
      }
    }
  }

  // Kick off the post-release glide using the velocity built up during the
  // drag. Each frame decays the velocity by MOMENTUM_FRICTION (normalised to
  // the frame's real duration so it's framerate-independent) and advances the
  // pan. An axis that clampTransform pins to an edge is zeroed immediately so
  // we don't spin frames pushing against a wall.
  function startMomentum() {
    if (!momentum) return
    stopMomentum()
    const v = { ...panVelocity.current }
    if (Math.hypot(v.x, v.y) < MIN_FLICK_VELOCITY) return
    let last = performance.now()
    const step = (now: number) => {
      // Cap dt so a backgrounded tab (huge gap) doesn't teleport the content.
      const dt = Math.min(now - last, 32)
      last = now
      const decay = Math.pow(MOMENTUM_FRICTION, dt / 16.667)
      v.x *= decay
      v.y *= decay
      if (Math.hypot(v.x, v.y) < MIN_STOP_VELOCITY) { momentumRaf.current = null; return }
      const cur    = transformRef.current
      const target = clampTransform({ ...cur, x: cur.x + v.x * dt, y: cur.y + v.y * dt })
      if (target.x === cur.x) v.x = 0
      if (target.y === cur.y) v.y = 0
      if (v.x === 0 && v.y === 0) { momentumRaf.current = null; return }
      setTransform(target)
      momentumRaf.current = requestAnimationFrame(step)
    }
    momentumRaf.current = requestAnimationFrame(step)
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
    // getMinScale() IS this axis's fit scale — sharing one formula keeps the
    // default framing and the max-zoom-out floor from ever disagreeing.
    setClampedTransform({ scale: getMinScale(), x: 0, y: 0 })
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
    stopMomentum()
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
    resetView() { stopMomentum(); interacted.current = false; applyDefaultView() },
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

  // Cancel any in-flight glide on unmount so its rAF loop doesn't keep calling
  // setTransform on a torn-down component.
  useEffect(() => stopMomentum, [])

  function onPointerDown(e: React.PointerEvent) {
    interacted.current = true
    // A new touch always cancels any glide in progress — pressing down means
    // "grab it here," the same as catching a spinning wheel.
    stopMomentum()
    // Deliberately do NOT capture the pointer here. A tap that opens a team's
    // info has to let its `click` fire on the team-name element; grabbing the
    // pointer onto the container on every press would retarget that click to
    // the container and swallow it. Capture is deferred to onPointerMove, once
    // travel proves the gesture is a real drag (see DRAG_THRESHOLD) — or taken
    // immediately below for a pinch, which is never a tap-to-open.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()]
      pinch.current = { startDist: dist(pts[0], pts[1]), startMid: midpoint(pts[0], pts[1]), start: transform }
      pan.current = null
      // Two fingers down is unambiguously a gesture (never a tap-to-open), so
      // grab both pointers onto the container now for re-render robustness.
      captureToContainer()
      // No flick out of a pinch — drop any velocity from a prior one-finger drag.
      panVelocity.current = { x: 0, y: 0 }
      lastPanSample.current = null
    } else if (pointers.current.size === 1) {
      pan.current = { start: { x: e.clientX, y: e.clientY }, startTransform: transform }
      panVelocity.current = { x: 0, y: 0 }
      lastPanSample.current = { x: e.clientX, y: e.clientY, t: performance.now() }
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
      // Once travel crosses the threshold the gesture is a drag, not a tap:
      // grab the pointer onto the container so the pan survives a mid-gesture
      // re-render. Staying hands-off below the threshold is what keeps a tap's
      // click landing on the team name it started on.
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) captureToContainer()
      setClampedTransform({ ...startTransform, x: startTransform.x + dx, y: startTransform.y + dy })

      // Track the flick velocity for momentum. An EMA over the last sample
      // keeps a fast swipe's speed even if the finger settles for a frame just
      // before lifting (which would otherwise read as near-zero velocity).
      if (momentum) {
        const now  = performance.now()
        const prev = lastPanSample.current
        if (prev) {
          const dt = now - prev.t
          if (dt > 0) {
            const vx = (e.clientX - prev.x) / dt
            const vy = (e.clientY - prev.y) / dt
            panVelocity.current = {
              x: vx * 0.7 + panVelocity.current.x * 0.3,
              y: vy * 0.7 + panVelocity.current.y * 0.3,
            }
          }
        }
        lastPanSample.current = { x: e.clientX, y: e.clientY, t: now }
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 1) {
      // Dropped from two fingers to one — resume panning from the survivor,
      // starting its velocity tracking fresh (the lifted finger's motion
      // shouldn't fling the content).
      const [[, p]] = pointers.current
      pan.current = { start: p, startTransform: transform }
      panVelocity.current = { x: 0, y: 0 }
      lastPanSample.current = { x: p.x, y: p.y, t: performance.now() }
    } else {
      // Last finger lifted after a one-finger drag — let it glide on.
      pan.current = null
      startMomentum()
    }
  }

  function onWheel(e: React.WheelEvent) {
    interacted.current = true
    stopMomentum()
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
