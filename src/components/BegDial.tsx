'use client'
import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X, Coins } from 'lucide-react'
import {
  BEG_MAX_AWARD,
  BEG_MIN_AWARD,
  BEG_CEILING,
} from '@/lib/beg-config'

// ── Types mirroring the API contract ──────────────────────────────────────────
type BegReason = 'ok' | 'not_broke' | 'no_begs_left' | 'cooldown'

interface BegState {
  tokens: number
  threshold: number
  ceiling: number
  begsUsed: number
  begsAllowed: number
  cooldownRemaining: number | null
  eligible: boolean
  reason: BegReason
}

interface BegSuccessResponse {
  ok: true
  awarded: number
  tokens: number
  begsUsed: number
}

interface BegErrorResponse {
  error: string
  state?: BegState
}

type Phase = 'loading' | 'blocked' | 'ready' | 'result' | 'error'

interface BegDialProps {
  onClose: () => void
  onAwarded: (newTokens: number) => void
}

// Full left↔right sweep duration (one direction), tuned to be a genuine but
// fair timing challenge.
const SWEEP_MS = 750

function randomBand() {
  // centre somewhere in the middle 50% of the track, half-width ~8-12%
  const center = 25 + Math.random() * 50
  const halfWidth = 8 + Math.random() * 4
  return { center, halfWidth }
}

export default function BegDial({ onClose, onAwarded }: BegDialProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [state, setState] = useState<BegState | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<BegSuccessResponse | null>(null)

  // Dial mechanics. The needle is animated by writing to the DOM node directly
  // (needleRef) each frame — NOT via React state — so the painted position is
  // always exactly what scoring reads (posRef), with no per-frame re-render lag
  // or stutter. stoppedPos only holds the frozen position for post-stop renders.
  const [stoppedPos, setStoppedPos] = useState(0)
  const [band, setBand] = useState(() => randomBand())
  const [frozen, setFrozen] = useState(false)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const posRef = useRef(0)
  const needleRef = useRef<HTMLDivElement>(null)

  // Body scroll lock while open
  useEffect(() => {
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [])

  // ── Load initial beg state ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/beg')
        const data: BegState | { error: string } = await res.json()
        if (cancelled) return
        if (!res.ok || !('eligible' in data)) {
          throw new Error('error' in data ? data.error : `Failed to load (${res.status})`)
        }
        setState(data)
        if (data.eligible) {
          setBand(randomBand())
          setPhase('ready')
        } else {
          setPhase('blocked')
        }
      } catch (e: unknown) {
        if (cancelled) return
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load beg status')
        setPhase('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Needle sweep animation (rAF, bounces at ends) ───────────────────────────
  const runSweep = useCallback(() => {
    startRef.current = null
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      // Triangle wave 0..100..0 with period 2*SWEEP_MS
      const cyclePos = (elapsed % (SWEEP_MS * 2)) / SWEEP_MS
      const pos = cyclePos <= 1 ? cyclePos * 100 : (2 - cyclePos) * 100
      posRef.current = pos
      if (needleRef.current) needleRef.current.style.left = `${pos}%`
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (phase !== 'ready' || frozen) return
    runSweep()
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [phase, frozen, runSweep])

  // ── Stop / submit ────────────────────────────────────────────────────────────
  async function handleStop() {
    if (frozen) return
    setFrozen(true)
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setStoppedPos(posRef.current)

    const dist = Math.abs(posRef.current - band.center)
    const accuracy = dist > band.halfWidth ? 0 : 1 - dist / band.halfWidth

    try {
      const res = await fetch('/api/beg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accuracy }),
      })
      const data: BegSuccessResponse | BegErrorResponse = await res.json()
      if (res.status === 409 && 'error' in data) {
        setErrorMsg(data.error)
        if (data.state) setState(data.state)
        setPhase('blocked')
        return
      }
      if (!res.ok || !('ok' in data)) {
        throw new Error('error' in data ? data.error : `Beg failed (${res.status})`)
      }
      setResult(data)
      onAwarded(data.tokens)
      setPhase('result')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong')
      setPhase('error')
    }
  }

  function reasonMessage(s: BegState): string {
    switch (s.reason) {
      case 'not_broke':
        return `You've still got tokens to play with — come back when you're under ${s.threshold}.`
      case 'no_begs_left':
        return `You've used all ${s.begsAllowed} of your begs.`
      case 'cooldown':
        return `Hang tight — beg again after ${s.cooldownRemaining} more match${s.cooldownRemaining === 1 ? '' : 'es'}.`
      default:
        return 'Begging is not available right now.'
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="glass-strong relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl"
        style={{
          background: 'rgba(4,2,12,0.9)',
          border: '1px solid rgba(255,107,0,0.35)',
          boxShadow: '0 8px 48px rgba(255,85,0,0.18)',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <Coins size={16} className="text-[#FFD700]" />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-[#FF6B00]" style={{ textShadow: '0 0 14px rgba(255,107,0,0.5)' }}>
              Beg For Tokens
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-foreground/60 transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div
                style={{
                  width: 28, height: 28, border: '3px solid #222', borderTopColor: '#FF6B00',
                  borderRadius: '50%', animation: 'begSpin 0.7s linear infinite',
                }}
              />
              <span className="text-[0.65rem] font-black uppercase tracking-[0.3em] text-white/40">
                Checking status…
              </span>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <p className="text-xs font-bold text-red-300">⚠️ {errorMsg ?? 'Something went wrong'}</p>
              <CloseButton onClose={onClose} />
            </div>
          )}

          {phase === 'blocked' && state && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="text-3xl">🥲</div>
              <p className="text-sm font-semibold text-white/80">{errorMsg ?? reasonMessage(state)}</p>
              <p className="text-[0.6rem] font-black uppercase tracking-[0.25em] text-white/30">
                Begs left: {Math.max(0, state.begsAllowed - state.begsUsed)} of {state.begsAllowed}
              </p>
              <CloseButton onClose={onClose} />
            </div>
          )}

          {phase === 'ready' && state && (
            <div className="flex flex-col gap-5">
              <p className="text-center text-xs font-semibold text-white/60">
                Time it right. Stop the needle inside the green zone for the best payout.
              </p>

              <DialTrack pos={stoppedPos} band={band} frozen={frozen} needleRef={needleRef} />

              <p className="text-center text-[0.6rem] font-black uppercase tracking-[0.2em] text-white/35">
                Bullseye +{BEG_MAX_AWARD} · edge +{BEG_MIN_AWARD} · miss +0
                <br />
                (capped so you can&apos;t exceed {BEG_CEILING})
              </p>

              <button
                onClick={handleStop}
                disabled={frozen}
                className="w-full rounded-xl py-4 text-sm font-black uppercase tracking-[0.3em] text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #FF6B00 0%, #cc4400 100%)',
                  border: '1px solid rgba(255,107,0,0.4)',
                  boxShadow: '0 4px 24px rgba(255,107,0,0.35)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }}
              >
                ◆ STOP ◆
              </button>

              <p className="text-center text-[0.55rem] font-black uppercase tracking-[0.25em] text-white/25">
                Begs left: {Math.max(0, state.begsAllowed - state.begsUsed)} of {state.begsAllowed}
              </p>
            </div>
          )}

          {phase === 'result' && result && (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <DialTrack pos={stoppedPos} band={band} frozen needleRef={needleRef} />
              {result.awarded > 0 ? (
                <>
                  <div className="text-3xl">🎉</div>
                  <p
                    className="text-2xl font-black text-[#FFD700]"
                    style={{ textShadow: '0 0 20px rgba(255,215,0,0.5)' }}
                  >
                    +{result.awarded} tokens!
                  </p>
                  <p className="text-xs font-semibold text-white/60">Nice timing.</p>
                </>
              ) : (
                <>
                  <div className="text-3xl">💀</div>
                  <p className="text-lg font-black text-white/70">Missed! No tokens this time.</p>
                </>
              )}
              <div
                className="flex items-center gap-2 rounded-full border px-4 py-1.5"
                style={{ background: 'rgba(255,107,0,0.08)', borderColor: 'rgba(255,180,0,0.3)' }}
              >
                <span className="text-base">🪙</span>
                <span className="text-lg font-black text-[#FFD700]">{result.tokens}</span>
                <span className="text-[0.55rem] font-black tracking-[0.2em] text-white/40">CR</span>
              </div>
              <CloseButton onClose={onClose} />
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes begSpin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="mt-1 rounded-xl border border-white/15 bg-white/5 px-6 py-2.5 text-xs font-black uppercase tracking-[0.25em] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      Close
    </button>
  )
}

interface DialTrackProps {
  pos: number
  band: { center: number; halfWidth: number }
  frozen: boolean
  needleRef: RefObject<HTMLDivElement | null>
}

function DialTrack({ pos, band, frozen, needleRef }: DialTrackProps) {
  const bandLeft = Math.max(0, band.center - band.halfWidth)
  const bandWidth = Math.min(100, band.center + band.halfWidth) - bandLeft

  return (
    <div
      className="relative w-full overflow-visible rounded-full"
      style={{
        height: 18,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Target band */}
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          left: `${bandLeft}%`,
          width: `${bandWidth}%`,
          background: 'linear-gradient(90deg, rgba(76,255,0,0.25), rgba(105,255,76,0.5), rgba(76,255,0,0.25))',
          boxShadow: '0 0 12px rgba(105,255,76,0.4)',
        }}
      />
      {/* Bullseye centre line */}
      <div
        className="absolute top-1/2"
        style={{
          left: `${band.center}%`,
          width: 2,
          height: 26,
          transform: 'translate(-50%, -50%)',
          background: '#9fffa0',
          boxShadow: '0 0 8px rgba(159,255,160,0.9)',
        }}
      />
      {/* Needle — position is driven imperatively via needleRef during the
          sweep; `pos` only sets the initial/frozen location on (re)render. */}
      <div
        ref={needleRef}
        className="absolute top-1/2"
        style={{
          left: `${pos}%`,
          width: 4,
          height: 32,
          transform: 'translate(-50%, -50%)',
          background: frozen ? '#FFD700' : '#FF6B00',
          borderRadius: 2,
          boxShadow: frozen
            ? '0 0 14px rgba(255,215,0,0.9)'
            : '0 0 10px rgba(255,107,0,0.8)',
          transition: frozen ? 'background 0.15s' : undefined,
        }}
      />
    </div>
  )
}
