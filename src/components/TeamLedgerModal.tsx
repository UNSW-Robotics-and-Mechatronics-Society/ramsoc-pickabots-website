'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

type TeamLedgerMatchEntry = {
  matchId: string
  opponentName: string
  teamScore: number
  opponentScore: number
  won: boolean
  roundLabel: string
}

type TeamLedger = {
  name: string
  kind: 'regular' | 'special'
  division: 'standards' | 'open' | null
  category: string | null
  pool: 'standards' | 'open' | 'boss' | 'other'
  totalTokensBet: number
  rank: number
  poolSize: number
  wins: number
  losses: number
  winRate: number
  pastMatches: TeamLedgerMatchEntry[]
  nextMatch: { opponentName: string; roundLabel: string; time: string | null } | null
  eliminated: { roundLabel: string } | null
}

export type TeamLedgerTarget = { name: string; division?: 'standards' | 'open' }

type Props = {
  target: TeamLedgerTarget | null
  onClose: () => void
}

const POOL_LABEL: Record<TeamLedger['pool'], string> = {
  standards: 'STANDARDS', open: 'OPEN', boss: 'BOSS', other: 'OTHER',
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
      <span style={{ fontSize: '0.78rem', fontWeight: 900, color, letterSpacing: 0.5, textAlign: 'center' }}>
        {value}
      </span>
    </div>
  )
}

// Fetches and renders one team's ledger. Keyed by name+division from the
// parent so switching targets mounts a fresh instance instead of resetting
// state inside an effect — same reasoning as UserLedgerModal's LedgerBody.
function LedgerBody({ name, division }: { name: string; division?: 'standards' | 'open' }) {
  const [ledger, setLedger] = useState<TeamLedger | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loading = !ledger && !error

  useEffect(() => {
    let cancelled = false
    const qs = division ? `?division=${division}` : ''
    fetch(`/api/teams/${encodeURIComponent(name)}${qs}`)
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Failed to load team')
        return body as TeamLedger
      })
      .then(data => { if (!cancelled) setLedger(data) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load team') })
    return () => { cancelled = true }
  }, [name, division])

  return (
    <>
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' }}>
          <div style={{
            width: 28, height: 28, border: '3px solid #222', borderTopColor: '#FF6B00',
            borderRadius: '50%', animation: 'teamLedgerSpin 0.7s linear infinite',
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <StatTile label="Win Rate" value={`${ledger.winRate}%`} color="#fff" />
            <StatTile label="Record" value={`${ledger.wins}W / ${ledger.losses}L`} color="#fff" />
            <StatTile
              label={`Tokens Bet · ${POOL_LABEL[ledger.pool]}`}
              value={`🪙 ${ledger.totalTokensBet.toLocaleString()} · #${ledger.rank}/${ledger.poolSize}`}
              color="#FFD700"
            />
          </div>

          {/* Next match / eliminated */}
          {ledger.nextMatch ? (
            <div style={{
              background: 'rgba(26,108,255,0.08)', border: '1px solid rgba(26,108,255,0.2)', borderRadius: 10,
              padding: '10px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: '0.44rem', fontWeight: 900, color: '#5A9FFF', textTransform: 'uppercase', letterSpacing: 3 }}>
                Next Match · {ledger.nextMatch.roundLabel}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#fff', marginTop: 3 }}>
                vs {ledger.nextMatch.opponentName}
                {ledger.nextMatch.time && (
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}> · {ledger.nextMatch.time}</span>
                )}
              </div>
            </div>
          ) : ledger.eliminated ? (
            <div style={{
              background: 'rgba(255,45,45,0.08)', border: '1px solid rgba(255,45,45,0.2)', borderRadius: 10,
              padding: '10px 14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: '0.44rem', fontWeight: 900, color: '#ff6666', textTransform: 'uppercase', letterSpacing: 3 }}>
                Knocked Out
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#fff', marginTop: 3 }}>
                {ledger.eliminated.roundLabel}
              </div>
            </div>
          ) : null}

          {/* Past matches */}
          <div style={{ fontSize: '0.48rem', fontWeight: 900, color: '#444', textTransform: 'uppercase', letterSpacing: 4, marginBottom: 10 }}>
            Past Matches
          </div>

          {ledger.pastMatches.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0 32px', color: '#444', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 2 }}>
              No matches played yet
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 20 }}>
            {ledger.pastMatches.map(m => (
              <div key={m.matchId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '0.62rem', fontWeight: 900, color: '#ddd', letterSpacing: 0.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    vs {m.opponentName}
                  </div>
                  <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                    {m.roundLabel} · {m.teamScore}–{m.opponentScore}
                  </div>
                </div>
                <span style={{
                  fontSize: '0.44rem', fontWeight: 900, letterSpacing: 1, padding: '2px 7px', borderRadius: 999,
                  color: m.won ? '#4ADE80' : '#ff6666',
                  background: m.won ? 'rgba(76,222,128,0.12)' : 'rgba(255,60,60,0.1)',
                }}>
                  {m.won ? 'WON' : 'LOST'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export default function TeamLedgerModal({ target, onClose }: Props) {
  const isOpen = target !== null

  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [isOpen])

  if (!target) return null

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
        animation: 'teamLedgerSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
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
          <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#FF6B00', textTransform: 'uppercase', letterSpacing: 3,
            textShadow: '0 0 16px rgba(255,107,0,0.5)' }}>
            {target.name}
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
          <LedgerBody name={target.name} division={target.division} key={`${target.name}-${target.division ?? ''}`} />
        </div>
      </div>

      <style>{`
        @keyframes teamLedgerSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes teamLedgerSpin { to{transform:rotate(360deg)} }
      `}</style>
    </div>,
    document.body,
  )
}
