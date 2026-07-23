'use client'
import { useState, useCallback, useRef } from 'react'

// ── Regular small toast ───────────────────────────────────────────────────────

export function useToast() {
  const [toast, setToast] = useState({ visible: false, msg: '' })
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  const show = useCallback((msg: string) => {
    clearTimeout(timer.current!)
    setToast({ visible: true, msg })
    timer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }, [])

  return { toast, show }
}

export default function Toast({ toast }: { toast: { visible: boolean; msg: string } }) {
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
}

export function useWinLossToast() {
  const [queue, setQueue] = useState<WinLossItem[]>([])

  const showWinLoss = useCallback((result: WinLossResult, botName: string) => {
    const id = Math.random().toString(36).slice(2)
    setQueue(prev => [...prev, { id, result, botName }])
  }, [])

  const dismissWinLoss = useCallback(() => {
    setQueue(prev => prev.slice(1))
  }, [])

  return { winLossQueue: queue, showWinLoss, dismissWinLoss }
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

      {/* Cards rendered back-to-front so the top card is on top in the DOM */}
      {[...visible].reverse().map((item, revIdx) => {
        // depth 0 = front card, depth 1 = one behind, depth 2 = furthest back
        const depth = visible.length - 1 - revIdx
        const isFront = depth === 0
        const isWin = item.result === 'win'

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
              background: isWin ? 'rgba(0,30,10,0.97)' : 'rgba(30,0,0,0.97)',
              border: `2px solid ${isWin ? '#00e676' : '#ff1744'}`,
              borderRadius: 22,
              padding: '32px 52px',
              backdropFilter: 'blur(24px)',
              boxShadow: isFront
                ? `0 0 80px ${isWin ? 'rgba(0,230,118,0.35)' : 'rgba(255,23,68,0.35)'}, 0 20px 60px rgba(0,0,0,0.6)`
                : `0 8px 32px rgba(0,0,0,0.4)`,
            }}>
              {isFront ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: 10, lineHeight: 1 }}>
                    {isWin ? '🏆' : '💔'}
                  </div>
                  <div style={{
                    fontSize: '2rem', fontWeight: 900, letterSpacing: 3,
                    color: isWin ? '#00e676' : '#ff1744',
                    textTransform: 'uppercase', lineHeight: 1,
                  }}>
                    {isWin ? 'YOU WON!' : 'YOU LOST'}
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
                      color: '#00e676', letterSpacing: 4, textTransform: 'uppercase', opacity: 0.8,
                    }}>
                      Tokens incoming ↑
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
