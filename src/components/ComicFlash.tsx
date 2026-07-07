'use client'
import { useState, useCallback, useEffect, useRef } from 'react'

const DURATION = 950

export function useComicFlash() {
  const [state, setState] = useState({ active: false, word: '' })

  const trigger = useCallback(() => {
    setState({ active: false, word: '' })
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setState({ active: true, word: '' }))
    )
    setTimeout(() => setState(s => ({ ...s, active: false })), DURATION + 60)
  }, [])

  return { state, trigger }
}

export default function ComicFlash({ state }: { state: { active: boolean; word: string } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    if (!state.active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const cx = canvas.width  / 2
    const cy = canvas.height / 2

    const stars = Array.from({ length: 110 }, () => ({
      angle:  Math.random() * Math.PI * 2,
      speed:  0.35 + Math.random() * 0.65,
      r:      Math.random() * 6,
      width:  0.4 + Math.random() * 1.4,
      warm:   Math.random() > 0.55,
    }))

    const start = performance.now()

    const frame = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (t < 0.2) {
        ctx.fillStyle = `rgba(255,110,20,${(0.2 - t) / 0.2 * 0.28})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy))
      vig.addColorStop(0,    'rgba(255,80,0,0.07)')
      vig.addColorStop(0.35, 'rgba(0,0,0,0)')
      vig.addColorStop(1,    'rgba(0,0,0,0.4)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const globalFade = t > 0.68 ? 1 - (t - 0.68) / 0.32 : 1

      for (const s of stars) {
        s.r += (1 + t * t * 16 * s.speed) * 2.4

        const tipX = cx + Math.cos(s.angle) * s.r
        const tipY = cy + Math.sin(s.angle) * s.r

        const streakLen = Math.min(s.r * 0.6 * (0.15 + t * 1.3), 140)
        const tailR  = Math.max(0, s.r - streakLen)
        const tailX  = cx + Math.cos(s.angle) * tailR
        const tailY  = cy + Math.sin(s.angle) * tailR

        const alpha = globalFade * Math.min(1, s.r / 28)

        const g = ctx.createLinearGradient(tailX, tailY, tipX, tipY)
        g.addColorStop(0,   'rgba(255,255,255,0)')
        g.addColorStop(0.5, s.warm
          ? `rgba(255,175,90,${alpha * 0.55})`
          : `rgba(190,215,255,${alpha * 0.45})`)
        g.addColorStop(1,   `rgba(255,255,255,${alpha})`)

        ctx.beginPath()
        ctx.moveTo(tailX, tailY)
        ctx.lineTo(tipX,  tipY)
        ctx.strokeStyle = g
        ctx.lineWidth   = s.width
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(tipX, tipY, s.width * 1.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.95})`
        ctx.fill()
      }

      if (t < 1) rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state.active])

  if (!state.active) return null

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 500, pointerEvents: 'none' }}
    />
  )
}
