'use client'
import { useState, useEffect } from 'react'

const MAX_BET_FRAC = 0.5  // max 50% of balance per bet

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

interface ModalCtx {
  matchId: string
  side: 'left' | 'right'
  botName: string
  compType: string
}

interface BetModalProps {
  ctx: ModalCtx | null
  tokens: number
  onConfirm: (amount: number) => void
  onClose: () => void
}

export default function BetModal({ ctx, tokens, onConfirm, onClose }: BetModalProps) {
  const [amount, setAmount] = useState(10)

  useEffect(() => {
    if (ctx) setAmount(Math.min(10, tokens))
  }, [ctx, tokens])

  if (!ctx) return null

  const cap = Math.max(1, Math.floor(tokens * MAX_BET_FRAC))
  const subtitle = ctx.compType === 'bossbot'
    ? (ctx.side === 'right' ? '💀 Betting BOSSBOT wins' : '⚡ Betting challenger wins')
    : `Targeting ${ctx.botName} for victory`

  return (
    <div
      onMouseDown={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,8,0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'rgba(4,2,12,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(255,107,0,0.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(155,48,255,0.05) 0%, transparent 55%)',
        border: '1px solid rgba(255,107,0,0.3)',
        borderBottom: 'none',
        borderRadius: '18px 18px 0 0',
        padding: '22px 20px 36px',
        width: '100%', maxWidth: 480,
        animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
        boxShadow: '0 -8px 48px rgba(255,85,0,0.12)',
      }}>
        {/* Grain overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: GRAIN, backgroundRepeat: 'repeat', backgroundSize: '140px 140px',
          opacity: 0.05,
        }}/>

        {/* Header */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#FF6B00', textTransform: 'uppercase', letterSpacing: 4,
              textShadow: '0 0 16px rgba(255,107,0,0.5)' }}>
              {ctx.botName}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#666', marginTop: 4, letterSpacing: 2 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#888',
            width: 30, height: 30, borderRadius: '50%', fontSize: '0.85rem', fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Tokens row */}
        <div style={{
          position: 'relative',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,107,0,0.05)', border: '1px solid rgba(255,107,0,0.12)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 16,
        }}>
          <span style={{ fontSize: '0.55rem', color: '#555', textTransform: 'uppercase', fontWeight: 900, letterSpacing: 4 }}>Credits</span>
          <span style={{ fontSize: '1rem', fontWeight: 900, color: '#FFD700', letterSpacing: 1 }}>🪙 {tokens}</span>
        </div>

        {/* Bet widget */}
        <div style={{
          position: 'relative',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: '14px 16px 16px', marginBottom: 14,
        }}>
          <div style={{ fontSize: '0.48rem', fontWeight: 900, color: '#444', textTransform: 'uppercase', letterSpacing: 4, marginBottom: 10 }}>
            Wager
          </div>
          <input
            type="range" min={1} max={cap} value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#FF6B00', height: 8 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5rem', color: '#333', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 3, marginTop: 6 }}>
            <span>1</span><span>MAX {cap}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
            <span style={{ fontSize: '1rem', color: '#FFD700', fontWeight: 900, alignSelf: 'flex-end', paddingBottom: 4 }}>🪙</span>
            <span style={{ fontSize: '2.8rem', fontWeight: 900, color: '#fff', letterSpacing: -2, lineHeight: 1,
              textShadow: '0 0 20px rgba(255,107,0,0.4)' }}>
              {amount}
            </span>
            <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, alignSelf: 'flex-end', paddingBottom: 6, letterSpacing: 3 }}>CR</span>
          </div>
        </div>

        {/* Quick bets */}
        <div style={{ position: 'relative', display: 'flex', gap: 8, marginBottom: 14 }}>
          {[0.25, 0.5, 0.75, 1].map(pct => (
            <button key={pct} onClick={() => setAmount(Math.max(1, Math.min(cap, Math.round(cap * pct))))}
              style={{
                flex: 1, padding: '8px 0',
                background: 'rgba(255,107,0,0.05)',
                border: '1px solid rgba(255,107,0,0.15)',
                borderRadius: 8,
                color: '#777', fontSize: '0.55rem', fontWeight: 900,
                textTransform: 'uppercase', letterSpacing: 3,
                fontFamily: 'inherit',
              }}>
              {pct === 1 ? 'MAX' : `${pct * 100}%`}
            </button>
          ))}
        </div>

        {/* Win preview */}
        <div style={{
          position: 'relative',
          background: 'rgba(0,40,10,0.4)', border: '1px solid rgba(76,255,0,0.15)', borderRadius: 10,
          padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
        }}>
          <span style={{ fontSize: '0.5rem', color: '#4caf50', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 4 }}>Return</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#69ff4c', letterSpacing: 1 }}>+{amount} → {amount * 2} 🪙</span>
        </div>

        <div style={{ position: 'relative', textAlign: 'center', fontSize: '0.48rem', color: '#333', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 14 }}>
          Max 50% of balance · <strong style={{ color: '#555' }}>{cap}</strong> credits
        </div>

        <button onClick={() => onConfirm(amount)} style={{
          position: 'relative',
          width: '100%', padding: 15,
          background: 'linear-gradient(135deg, #FF6B00 0%, #cc4400 100%)',
          border: '1px solid rgba(255,107,0,0.4)',
          borderRadius: 12, fontSize: '0.9rem', fontWeight: 900, color: '#fff',
          textTransform: 'uppercase', letterSpacing: 5, fontFamily: 'inherit',
          boxShadow: '0 4px 24px rgba(255,107,0,0.35)',
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}>
          ◆ LOCK IN BET ◆
        </button>
      </div>

      <style>{`@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }`}</style>
    </div>
  )
}
