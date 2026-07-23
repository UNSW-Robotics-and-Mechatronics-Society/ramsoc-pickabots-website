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

// ── Big centered win/loss notification ────────────────────────────────────────

export type WinLossResult = 'win' | 'loss'

interface WinLossState {
  visible: boolean
  result: WinLossResult
  botName: string
}

export function useWinLossToast() {
  const [state, setState] = useState<WinLossState>({ visible: false, result: 'win', botName: '' })
  const timer = useRef<ReturnType<typeof setTimeout>>(null)

  const show = useCallback((result: WinLossResult, botName: string) => {
    clearTimeout(timer.current!)
    setState({ visible: true, result, botName })
    timer.current = setTimeout(() => setState(s => ({ ...s, visible: false })), 4000)
  }, [])

  return { winLossState: state, showWinLoss: show }
}

export function WinLossToast({ state }: { state: { visible: boolean; result: WinLossResult; botName: string } }) {
  const isWin = state.result === 'win'

  return (
    <>
      {/* Full-screen dim when active */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 8000,
        opacity: state.visible ? 1 : 0,
        pointerEvents: 'none',
        transition: 'opacity 0.3s',
      }} />

      {/* Centered card */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: `translate(-50%, -50%) scale(${state.visible ? 1 : 0.7})`,
        zIndex: 9000,
        opacity: state.visible ? 1 : 0,
        pointerEvents: 'none',
        transition: 'all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        textAlign: 'center',
        minWidth: 260,
      }}>
        <div style={{
          background: isWin ? 'rgba(0,30,10,0.97)' : 'rgba(30,0,0,0.97)',
          border: `2px solid ${isWin ? '#00e676' : '#ff1744'}`,
          borderRadius: 22,
          padding: '32px 52px',
          boxShadow: `0 0 80px ${isWin ? 'rgba(0,230,118,0.35)' : 'rgba(255,23,68,0.35)'}, 0 20px 60px rgba(0,0,0,0.6)`,
          backdropFilter: 'blur(24px)',
        }}>
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
            {state.botName}
          </div>
          {isWin && (
            <div style={{
              marginTop: 14, fontSize: '0.65rem', fontWeight: 900,
              color: '#00e676', letterSpacing: 4, textTransform: 'uppercase',
              opacity: 0.8,
            }}>
              Tokens incoming ↑
            </div>
          )}
        </div>
      </div>
    </>
  )
}
