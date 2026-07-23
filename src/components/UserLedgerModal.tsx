'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

type LedgerEntry = {
  id: string
  matchId: string
  compType: string
  pickedName: string
  opponentName: string
  side: 'left' | 'right'
  amount: number
  status: 'pending' | 'won' | 'lost'
  payout: number | null
  net: number | null
  createdAt: string
}

type UserLedger = {
  id: string
  name: string
  tokens: number
  wins: number
  losses: number
  winRate: number
  totalGained: number
  totalLost: number
  netTotal: number
  entries: LedgerEntry[]
}

type Target = { id: string; name: string; rank: number }

type Props = {
  target: Target | null
  onClose: () => void
}

const MEDAL = ['🥇', '🥈', '🥉']

const STATUS_STYLE: Record<LedgerEntry['status'], { label: string; color: string; bg: string }> = {
  won:     { label: 'WON',     color: '#4ADE80', bg: 'rgba(76,222,128,0.12)' },
  lost:    { label: 'LOST',    color: '#ff6666', bg: 'rgba(255,60,60,0.1)' },
  pending: { label: 'PENDING', color: '#FFD700', bg: 'rgba(255,215,0,0.1)' },
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '10px 8px', borderRadius: 10,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <span style={{ fontSize: '0.42rem', fontWeight: 900, letterSpacing: 2, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', textAlign: 'center' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.78rem', fontWeight: 900, color, letterSpacing: 0.5 }}>
        {value}
      </span>
    </div>
  )
}

// Fetches and renders one user's ledger. Keyed by userId from the parent
// (see below) — switching to a different pilot mounts a fresh instance
// instead of resetting state inside an effect, so `ledger`/`error` start
// clean for free and the effect only ever calls setState from its fetch
// callbacks, never synchronously in the effect body.
function LedgerBody({ userId }: { userId: string }) {
  const [ledger, setLedger] = useState<UserLedger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = !ledger && !error

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leaderboard/${userId}`)
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Failed to load ledger')
        return body as UserLedger
      })
      .then(data => { if (!cancelled) setLedger(data) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load ledger') })
    return () => { cancelled = true }
  }, [userId])

  return (
    <>
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' }}>
          <div style={{
            width: 28, height: 28, border: '3px solid #222', borderTopColor: '#FF6B00',
            borderRadius: '50%', animation: 'ledgerSpin 0.7s linear infinite',
          }}/>
        </div>
      )}

      {error && (
        <div style={{
          padding: 16, background: 'rgba(30,0,0,0.8)', border: '1px solid rgba(255,45,45,0.4)',
          borderRadius: 12, color: '#ff6666', fontSize: '0.7rem', fontWeight: 900, textAlign: 'center',
          letterSpacing: 1, marginBottom: 16,
        }}>
          ⚠️ {error}
        </div>
      )}

      {ledger && (
        <>
          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <StatTile label="Win Rate" value={`${ledger.winRate}%`} color="#fff" />
            <StatTile label="Record" value={`${ledger.wins}W / ${ledger.losses}L`} color="#fff" />
            <StatTile label="Balance" value={`🪙 ${ledger.tokens.toLocaleString()}`} color="#FFD700" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <StatTile label="Coins Gained" value={`+${ledger.totalGained.toLocaleString()}`} color="#4ADE80" />
            <StatTile label="Coins Lost" value={`-${ledger.totalLost.toLocaleString()}`} color="#ff6666" />
            <StatTile
              label="Net"
              value={`${ledger.netTotal >= 0 ? '+' : ''}${ledger.netTotal.toLocaleString()}`}
              color={ledger.netTotal >= 0 ? '#4ADE80' : '#ff6666'}
            />
          </div>

          {/* Vote history */}
          <div style={{ fontSize: '0.48rem', fontWeight: 900, color: '#444', textTransform: 'uppercase', letterSpacing: 4, marginBottom: 10 }}>
            Vote History
          </div>

          {ledger.entries.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0 32px', color: '#444', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 2 }}>
              No votes placed yet
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 20 }}>
            {ledger.entries.map(e => {
              const st = STATUS_STYLE[e.status]
              return (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: '0.62rem', fontWeight: 900, color: '#ddd', letterSpacing: 0.5,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {e.pickedName} <span style={{ color: 'rgba(255,255,255,0.3)' }}>vs</span> {e.opponentName}
                    </div>
                    <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                      🪙 {e.amount} wagered
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.44rem', fontWeight: 900, letterSpacing: 1, padding: '2px 7px', borderRadius: 999,
                      color: st.color, background: st.bg,
                    }}>
                      {st.label}
                    </span>
                    <span style={{
                      fontSize: '0.62rem', fontWeight: 900,
                      color: e.net === null ? 'rgba(255,255,255,0.3)' : e.net >= 0 ? '#4ADE80' : '#ff6666',
                    }}>
                      {e.net === null ? '—' : `${e.net >= 0 ? '+' : ''}${e.net}`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

export default function UserLedgerModal({ target, onClose }: Props) {
  const isOpen = target !== null

  // Same reasoning as VoteModal: without this, a scroll/touch gesture over
  // the (visually blocking) modal scrolls the leaderboard underneath instead.
  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [isOpen])

  if (!target) return null

  const isTop3 = target.rank <= 3

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
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: GRAIN, backgroundRepeat: 'repeat', backgroundSize: '140px 140px',
          opacity: 0.05,
        }}/>

        {/* Header */}
        <div style={{
          position: 'relative', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '22px 20px 0',
        }}>
          <div>
            <div style={{ fontSize: '0.5rem', fontWeight: 900, letterSpacing: 3, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {isTop3 ? MEDAL[target.rank - 1] : `Rank #${target.rank}`}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#FF6B00', textTransform: 'uppercase', letterSpacing: 3,
              textShadow: '0 0 16px rgba(255,107,0,0.5)' }}>
              {target.name}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#888',
            width: 30, height: 30, borderRadius: '50%', fontSize: '0.85rem', fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{
          position: 'relative', flex: 1, minHeight: 0,
          overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          padding: '16px 20px 0',
        }}>
          <LedgerBody userId={target.id} key={target.id} />
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes ledgerSpin { to{transform:rotate(360deg)} }
      `}</style>
    </div>,
    document.body,
  )
}
