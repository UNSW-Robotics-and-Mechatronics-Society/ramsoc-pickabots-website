'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import RamCoin from './RamCoin'

const MAX_VOTE_FRAC = 0.5  // max 50% of balance per vote

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

interface ModalCtx {
  matchId: string
  side: 'left' | 'right'
  botName: string
  compType: string
}

interface VoteModalProps {
  ctx: ModalCtx | null
  tokens: number
  // ALL IN mode (admin toggle): lifts the 50%-of-balance cap so a player can
  // stake their whole balance on one vote. place_vote enforces this too.
  allIn?: boolean
  onConfirm: (amount: number) => void
  onClose: () => void
}

export default function VoteModal({ ctx, tokens, allIn = false, onConfirm, onClose }: VoteModalProps) {
  const [amount, setAmount] = useState(10)
  // Raw text of the amount field — kept separate from `amount` so the user
  // can freely type (clear the field, type digits that momentarily exceed
  // the cap) without the input fighting them mid-keystroke. `amount` (used
  // by the slider, quick-amount buttons, reward preview, and confirm) always
  // tracks the clamped, valid interpretation of whatever's been typed so far.
  const [amountText, setAmountText] = useState('10')
  // Shows the "Are you sure?" step when the player is about to stake their
  // whole balance (an all-in bet).
  const [askingAllIn, setAskingAllIn] = useState(false)
  const isOpen = ctx !== null

  // Resets the default amount whenever a new vote modal opens (or the
  // balance it's capped against changes) — adjusted during render, via a
  // state (not ref) comparison, per React's documented "reset state when a
  // prop changes" pattern (react.dev/learn/you-might-not-need-an-effect).
  const [resetKey, setResetKey] = useState<{ ctx: ModalCtx | null; tokens: number } | null>(null)
  if (ctx && (resetKey?.ctx !== ctx || resetKey?.tokens !== tokens)) {
    setResetKey({ ctx, tokens })
    const initial = Math.min(10, tokens)
    setAmount(initial)
    setAmountText(String(initial))
    setAskingAllIn(false)
  }

  // Without this, the page behind the (visually blocking) modal is still
  // the only scrollable element in the DOM, so a wheel/touch scroll while
  // the modal is open scrolls the match list underneath instead of the
  // modal itself.
  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [isOpen])

  if (!ctx) return null

  const cap = Math.max(1, allIn ? tokens : Math.floor(tokens * MAX_VOTE_FRAC))
  // An "all in" bet stakes the entire balance. Only really reachable in the
  // admin's ALL IN mode (where cap === tokens); triggers the confirm step.
  const isAllInBet = tokens > 0 && amount >= tokens

  // CONFIRM: interpose an "are you sure?" step for all-in bets; otherwise fire.
  function requestConfirm() {
    if (isAllInBet) setAskingAllIn(true)
    else onConfirm(amount)
  }

  const subtitle = ctx.compType === 'bossbot'
    ? (ctx.side === 'right' ? '💀 Voting BOSSBOT wins' : '⚡ Voting challenger wins')
    : `Targeting ${ctx.botName} for victory`

  // Shared by the slider and quick-amount buttons — always clamps to
  // [1, cap] and keeps the text field's displayed digits in sync.
  function updateAmount(n: number) {
    const clamped = Math.max(1, Math.min(cap, Math.round(n)))
    setAmount(clamped)
    setAmountText(String(clamped))
  }

  function handleAmountTextChange(raw: string) {
    const digitsOnly = raw.replace(/[^0-9]/g, '')
    setAmountText(digitsOnly)
    if (digitsOnly !== '') setAmount(Math.max(1, Math.min(cap, Number(digitsOnly))))
  }

  // Portaled straight to <body> — the root layout's <main> that this
  // component would otherwise render inside has its own z-10 stacking
  // context (see layout.tsx), which traps any z-index used in here below
  // the sibling bottom nav bar's z-50, no matter how high. Escaping via a
  // portal is what actually lets the modal paint above it.
  return createPortal(
    <div
      onMouseDown={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,8,0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        touchAction: 'none',
      }}
    >
      <div style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        // Leaves room above the bottom nav bar (~64px tall + safe-area
        // inset) so the sheet never has to compete with it for space —
        // the confirm button below is always inside this bound, never
        // behind the nav.
        maxHeight: 'calc(100dvh - 84px - env(safe-area-inset-bottom, 0px))',
        background: 'rgba(4,2,12,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        backgroundImage: 'radial-gradient(ellipse at 20% 0%, rgba(255,107,0,0.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(155,48,255,0.05) 0%, transparent 55%)',
        border: '1px solid rgba(255,107,0,0.3)',
        borderBottom: 'none',
        borderRadius: '18px 18px 0 0',
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

        {/* Header — stays fixed above the scrollable body below, always visible */}
        <div style={{
          position: 'relative', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '22px 20px 0',
        }}>
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

        {/* Scrollable body — everything that can grow past the available
            height scrolls in here, independent of the page behind it. */}
        <div style={{
          position: 'relative', flex: 1, minHeight: 0,
          overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
          // touch-action intersects down through ancestors — the backdrop's
          // touchAction: 'none' below would otherwise also block touch-
          // scrolling in here. This explicitly restores vertical panning
          // for gestures that start on the scrollable body.
          touchAction: 'pan-y',
          padding: '16px 20px 0',
        }}>
          {/* Tokens row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(255,107,0,0.05)', border: '1px solid rgba(255,107,0,0.12)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          }}>
            <span style={{ fontSize: '0.55rem', color: '#555', textTransform: 'uppercase', fontWeight: 900, letterSpacing: 4 }}>RamCoins</span>
            <span style={{ fontSize: '1rem', fontWeight: 900, color: '#FFD700', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 5 }}><RamCoin size={18}/>{tokens}</span>
          </div>

          {/* Vote widget */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, padding: '14px 16px 16px', marginBottom: 14,
          }}>
            <div style={{ fontSize: '0.48rem', fontWeight: 900, color: '#444', textTransform: 'uppercase', letterSpacing: 4, marginBottom: 10 }}>
              Amount
            </div>
            <input
              type="range" min={1} max={cap} value={amount}
              onChange={e => updateAmount(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#FF6B00', height: 8 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5rem', color: '#333', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 3, marginTop: 6 }}>
              <span>1</span><span>MAX {cap}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              <RamCoin size={16} style={{ alignSelf: 'flex-end', marginBottom: 4 }}/>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={amountText}
                onChange={e => handleAmountTextChange(e.target.value)}
                onFocus={e => e.target.select()}
                onBlur={() => setAmountText(String(amount))}
                style={{
                  width: `${Math.max(2, amountText.length)}ch`,
                  fontSize: '2.8rem', fontWeight: 900, color: '#fff', letterSpacing: -2, lineHeight: 1,
                  textShadow: '0 0 20px rgba(255,107,0,0.4)',
                  background: 'transparent', border: 'none', outline: 'none',
                  textAlign: 'center', padding: 0, fontFamily: 'inherit',
                }}
              />
              <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, alignSelf: 'flex-end', paddingBottom: 6, letterSpacing: 3 }}>RC</span>
            </div>
          </div>

          {/* Quick amounts */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[0.25, 0.5, 0.75, 1].map(pct => (
              <button key={pct} onClick={() => updateAmount(cap * pct)}
                style={{
                  flex: 1, padding: '8px 0',
                  background: 'rgba(255,107,0,0.05)',
                  border: '1px solid rgba(255,107,0,0.15)',
                  borderRadius: 8,
                  color: '#777', fontSize: '0.55rem', fontWeight: 900,
                  textTransform: 'uppercase', letterSpacing: 3,
                  fontFamily: 'inherit',
                }}>
                {pct === 1 ? (allIn ? 'ALL IN' : 'MAX (50%)') : `${pct * 100}%`}
              </button>
            ))}
          </div>

          {/* Reward preview */}
          <div style={{
            background: 'rgba(0,40,10,0.4)', border: '1px solid rgba(76,255,0,0.15)', borderRadius: 10,
            padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
          }}>
            <span style={{ fontSize: '0.5rem', color: '#4caf50', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 4 }}>Reward</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#69ff4c', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 5 }}>+{amount} → {amount * 2} <RamCoin size={16}/></span>
          </div>

          <div style={{ textAlign: 'center', fontSize: '0.48rem', color: '#fff', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 14 }}>
            {allIn ? 'ALL IN — max' : 'Max Vote: 50% of balance'} <strong style={{ color: '#fff' }}>{cap}</strong> RamCoins
          </div>
        </div>

        {/* Footer — stays fixed below the scrollable body, always visible/clickable */}
        <div style={{ position: 'relative', flexShrink: 0, padding: '14px 20px calc(22px + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={requestConfirm} style={{
            width: '100%', padding: 15,
            background: isAllInBet
              ? 'linear-gradient(135deg, #FFD700 0%, #FF8A00 100%)'
              : 'linear-gradient(135deg, #FF6B00 0%, #cc4400 100%)',
            border: `1px solid ${isAllInBet ? 'rgba(255,215,0,0.5)' : 'rgba(255,107,0,0.4)'}`,
            borderRadius: 12, fontSize: '0.9rem', fontWeight: 900, color: isAllInBet ? '#1a1200' : '#fff',
            textTransform: 'uppercase', letterSpacing: 5, fontFamily: 'inherit',
            boxShadow: isAllInBet ? '0 4px 24px rgba(255,196,0,0.45)' : '0 4px 24px rgba(255,107,0,0.35)',
            textShadow: isAllInBet ? 'none' : '0 1px 4px rgba(0,0,0,0.5)',
          }}>
            {isAllInBet ? '◆ GO ALL IN ◆' : '◆ CONFIRM VOTE ◆'}
          </button>
        </div>

        {/* All-in "are you sure?" — covers the sheet until the player commits
            or backs out. Reachable only when the bet stakes the whole balance. */}
        {askingAllIn && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            borderRadius: '18px 18px 0 0',
            background: 'rgba(6,3,0,0.94)',
            backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '28px 26px calc(28px + env(safe-area-inset-bottom, 0px))', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2.6rem', lineHeight: 1, marginBottom: 12 }}>⚠️</div>
            <div style={{
              fontSize: '1.35rem', fontWeight: 900, letterSpacing: 3, color: '#FFD700',
              textTransform: 'uppercase', textShadow: '0 0 18px rgba(255,215,0,0.5)',
            }}>
              Go all in?
            </div>
            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, maxWidth: 300 }}>
              You&rsquo;re staking <strong style={{ color: '#FFD700' }}>all {tokens}</strong> of your RamCoin on{' '}
              <strong style={{ color: '#fff' }}>{ctx.botName}</strong>. Lose and you&rsquo;re wiped out.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, width: '100%', maxWidth: 340 }}>
              <button onClick={() => setAskingAllIn(false)} style={{
                flex: 1, padding: 13, background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12,
                fontSize: '0.75rem', fontWeight: 900, color: '#bbb',
                textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'inherit',
              }}>
                Cancel
              </button>
              <button onClick={() => { setAskingAllIn(false); onConfirm(amount) }} style={{
                flex: 1.4, padding: 13,
                background: 'linear-gradient(135deg, #FFD700 0%, #FF8A00 100%)',
                border: '1px solid rgba(255,215,0,0.5)', borderRadius: 12,
                fontSize: '0.75rem', fontWeight: 900, color: '#1a1200',
                textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(255,196,0,0.5)',
              }}>
                All In!
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }`}</style>
    </div>,
    document.body,
  )
}
