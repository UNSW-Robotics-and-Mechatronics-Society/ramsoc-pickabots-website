'use client'
import { useState, useCallback, useRef, type ReactNode } from 'react'

// ── Regular small toast ───────────────────────────────────────────────────────

// msg is a ReactNode, not a string, so callers can drop the <RamCoin> graphic
// into a message instead of settling for the 🪙 emoji. Plain strings still work.
type ToastState = { visible: boolean; msg: ReactNode }

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ visible: false, msg: '' })
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  const show = useCallback((msg: ReactNode) => {
    clearTimeout(timer.current!)
    setToast({ visible: true, msg })
    timer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }, [])

  return { toast, show }
}

export default function Toast({ toast }: { toast: ToastState }) {
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%',
      transform: `translateX(-50%) translateY(${toast.visible ? 0 : 20}px)`,
      background: '#0d0d1f', border: '2px solid #FFD700',
      borderRadius: 999, padding: '8px 20px',
      fontSize: '0.75rem', fontWeight: 900, color: '#FFD700',
      zIndex: 300, opacity: toast.visible ? 1 : 0,
      transition: 'all 0.3s', whiteSpace: 'nowrap', pointerEvents: 'none',
    }}>
      {toast.msg}
    </div>
  )
}

// ── Stacking win/loss notifications ──────────────────────────────────────────

export type WinLossResult = 'win' | 'loss'

export interface WinLossItem {
  id: string
  result: WinLossResult
  botName: string
  // A winning ALL-IN bet — gets the gold + confetti treatment.
  allIn?: boolean
}

export function useWinLossToast() {
  const [queue, setQueue] = useState<WinLossItem[]>([])

  const showWinLoss = useCallback((result: WinLossResult, botName: string, allIn = false) => {
    const id = Math.random().toString(36).slice(2)
    setQueue(prev => [...prev, { id, result, botName, allIn }])
  }, [])

  const dismissWinLoss = useCallback(() => {
    setQueue(prev => prev.slice(1))
  }, [])

  return { winLossQueue: queue, showWinLoss, dismissWinLoss }
}

// Self-contained confetti burst for an all-in jackpot — a spray of gold/white
// pieces that fall and fade. No dependency; pieces are generated once so they
// stay stable across the overlay's re-renders.
const CONFETTI_COLORS = ['#FFD700', '#FFB300', '#FFF3B0', '#FF8A00', '#FFFFFF']
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 48 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.2 + Math.random() * 1.8,
      drift: (Math.random() - 0.5) * 180,
      size: 6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  )
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9005, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute', top: '-8%', left: `${p.left}%`,
            width: p.size, height: p.size * 0.42,
            background: p.color, borderRadius: 1,
            ['--drift' as string]: `${p.drift}px`,
            animation: `confettiFall ${p.duration}s ${p.delay}s linear forwards`,
          }}
        />
      ))}
      <style>{`@keyframes confettiFall {
        0%   { transform: translate(0, 0) rotate(0deg);   opacity: 1; }
        100% { transform: translate(var(--drift), 112vh) rotate(760deg); opacity: 0.85; }
      }`}</style>
    </div>
  )
}

export function WinLossToast({
  queue,
  onDismiss,
}: {
  queue: WinLossItem[]
  onDismiss: () => void
}) {
  if (queue.length === 0) return null

  // Show at most 3 cards in the stack; the rest are invisible behind them
  const visible = queue.slice(0, 3)
  // Confetti only while the FRONT card is a winning all-in bet.
  const front = queue[0]
  const showConfetti = front?.result === 'win' && !!front.allIn

  return (
    <>
      {/* Full-screen backdrop — click anywhere to dismiss the top card */}
      <div
        onClick={onDismiss}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 8000,
          cursor: 'pointer',
        }}
      />

      {showConfetti && <Confetti />}

      {/* Cards rendered back-to-front so the top card is on top in the DOM */}
      {[...visible].reverse().map((item, revIdx) => {
        // depth 0 = front card, depth 1 = one behind, depth 2 = furthest back
        const depth = visible.length - 1 - revIdx
        const isFront = depth === 0
        const isWin = item.result === 'win'
        // Gold jackpot treatment for a winning all-in bet.
        const isGold = isWin && !!item.allIn

        const accent = isGold ? '#FFD700' : isWin ? '#00e676' : '#ff1744'
        const cardBg = isGold
          ? 'linear-gradient(160deg, rgba(46,34,0,0.98) 0%, rgba(20,13,0,0.98) 100%)'
          : isWin ? 'rgba(0,30,10,0.97)' : 'rgba(30,0,0,0.97)'
        const glow = isGold ? 'rgba(255,196,0,0.5)' : isWin ? 'rgba(0,230,118,0.35)' : 'rgba(255,23,68,0.35)'

        return (
          <div
            key={item.id}
            onClick={isFront ? onDismiss : undefined}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              // Cards behind shift down slightly and shrink
              transform: `translate(-50%, calc(-50% + ${depth * 16}px)) scale(${1 - depth * 0.05})`,
              zIndex: 9010 - depth,
              textAlign: 'center',
              minWidth: 260,
              opacity: 1 - depth * 0.18,
              pointerEvents: isFront ? 'auto' : 'none',
              transition: 'transform 0.3s ease, opacity 0.3s ease',
              cursor: isFront ? 'pointer' : 'default',
            }}
          >
            <div style={{
              background: cardBg,
              border: `2px solid ${accent}`,
              borderRadius: 22,
              padding: '32px 52px',
              backdropFilter: 'blur(24px)',
              boxShadow: isFront
                ? `0 0 80px ${glow}, 0 20px 60px rgba(0,0,0,0.6)`
                : `0 8px 32px rgba(0,0,0,0.4)`,
            }}>
              {isFront ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: 10, lineHeight: 1 }}>
                    {isGold ? '👑' : isWin ? '🏆' : '💔'}
                  </div>
                  {isGold && (
                    <div style={{
                      fontSize: '0.6rem', fontWeight: 900, letterSpacing: 5,
                      color: '#FFD700', textTransform: 'uppercase', marginBottom: 8,
                      textShadow: '0 0 12px rgba(255,215,0,0.6)',
                    }}>
                      ★ All-In Jackpot ★
                    </div>
                  )}
                  <div style={{
                    fontSize: '2rem', fontWeight: 900, letterSpacing: 3,
                    color: accent,
                    textTransform: 'uppercase', lineHeight: 1,
                    textShadow: isGold ? '0 0 22px rgba(255,215,0,0.55)' : 'none',
                  }}>
                    {isGold ? 'JACKPOT!' : isWin ? 'YOU WON!' : 'YOU LOST'}
                  </div>
                  <div style={{
                    fontSize: '1rem', fontWeight: 900, color: 'rgba(255,255,255,0.7)',
                    marginTop: 10, letterSpacing: 1, textTransform: 'uppercase',
                  }}>
                    {item.botName}
                  </div>
                  {isWin && (
                    <div style={{
                      marginTop: 14, fontSize: '0.65rem', fontWeight: 900,
                      color: accent, letterSpacing: 4, textTransform: 'uppercase', opacity: 0.85,
                    }}>
                      {isGold ? 'You went all in — and won ↑' : 'Tokens incoming ↑'}
                    </div>
                  )}
                  {queue.length > 1 && (
                    <div style={{
                      marginTop: 16, fontSize: '0.5rem', fontWeight: 900,
                      color: 'rgba(255,255,255,0.28)', letterSpacing: 3, textTransform: 'uppercase',
                    }}>
                      tap anywhere · {queue.length - 1} more
                    </div>
                  )}
                </>
              ) : (
                /* Dimmed placeholder content so the card has the right height */
                <div style={{ visibility: 'hidden', fontSize: '2rem', lineHeight: 1 }}>
                  ████<br/>████████<br/>████
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
