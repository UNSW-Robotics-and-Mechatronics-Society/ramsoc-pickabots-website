'use client'
import { useState } from 'react'
import RamCoin from './RamCoin'
import UserLedgerModal from './UserLedgerModal'
import LeaderboardSearch from './LeaderboardSearch'
import { usePickFilter } from '@/lib/pickFilter'

export type LeaderboardEntry = { id: string; name: string; tokens: number; wins: number; losses: number }

type Player = {
  id: string
  rank: number
  name: string
  credits: number
  wins: number
  losses: number
}

const MEDAL = ['🥇', '🥈', '🥉']

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

/** Players ranked by RamCoins held. */
export default function PlayerBoard({ players }: { players: LeaderboardEntry[] }) {
  const [selected, setSelected] = useState<{ id: string; name: string; rank: number } | null>(null)

  const PLAYERS: Player[] = players.map((p, i) => ({
    id: p.id,
    rank: i + 1,
    name: p.name,
    credits: p.tokens,
    wins: p.wins,
    losses: p.losses,
  }))

  // Filters the already-ranked list, so rows stay ordered most→least tokens and
  // each keeps its true leaderboard rank (not a re-index of the subset).
  const filter = usePickFilter(PLAYERS)
  const visible = filter.visible

  return (
    <>
      <LeaderboardSearch
        placeholder="Search players…"
        noun="player"
        query={filter.query}
        onQueryChange={filter.setQuery}
        showSuggestions={filter.showSuggestions}
        setShowSuggestions={filter.setShowSuggestions}
        suggestions={filter.suggestions.map(p => ({ id: p.id, name: p.name, rank: p.rank, coins: p.credits }))}
        pickedRows={filter.pickedItems.map(p => ({ id: p.id, name: p.name, rank: p.rank, coins: p.credits }))}
        onPick={filter.pick}
        onUnpick={filter.unpick}
        onClearAll={filter.clearAll}
        visibleCount={visible.length}
        totalCount={PLAYERS.length}
      />

      {/* Column headers */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px',
        background: 'rgba(4,2,12,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        fontSize: '0.4rem', fontWeight: 900, letterSpacing: 3,
        color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
      }}>
        <span style={{ width: 38 }}>#</span>
        <span style={{ flex: 1 }}>Player</span>
        <span style={{ width: 76, textAlign: 'right' }}>Ramcoins</span>
        <span style={{ width: 56, textAlign: 'right' }}>W / L</span>
        <span style={{ width: 46, textAlign: 'right' }}>Rate</span>
      </div>

      {/* Player rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' }}>
        {visible.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.3)',
            fontSize: '0.6rem', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase',
          }}>
            {filter.picked.length ? 'Selected players are no longer ranked' : 'No players yet'}
          </div>
        )}
        {visible.map(p => {
          const winRate = p.wins + p.losses > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0
          const isTop3  = p.rank <= 3
          return (
            <button
              key={p.id}
              onClick={() => setSelected({ id: p.id, name: p.name, rank: p.rank })}
              style={{
              position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center',
              width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
              padding: '13px 12px',
              background: isTop3 ? 'rgba(255,107,0,0.1)' : 'rgba(6,3,16,0.82)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${isTop3 ? 'rgba(255,107,0,0.28)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 10,
              boxShadow: isTop3 ? '0 0 20px rgba(255,107,0,0.1)' : '0 2px 12px rgba(0,0,0,0.5)',
            }}>
              {/* Grain */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: GRAIN, backgroundSize: '140px 140px', opacity: 0.05,
              }}/>

              {/* Rank */}
              <div style={{ width: 38, fontSize: isTop3 ? '1.1rem' : '0.68rem', flexShrink: 0, position: 'relative' }}>
                {isTop3
                  ? MEDAL[p.rank - 1]
                  : <span style={{ fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>{p.rank}</span>
                }
              </div>

              {/* Name + win bar */}
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <div style={{
                  fontSize: '0.7rem', fontWeight: 900, letterSpacing: 2,
                  color: isTop3 ? '#fff' : 'rgba(210,210,210,0.9)',
                  textTransform: 'uppercase', marginBottom: 5,
                }}>
                  {p.name}
                </div>
                <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 99, width: '85%' }}>
                  <div style={{
                    height: '100%', borderRadius: 99, width: `${winRate}%`,
                    background: isTop3
                      ? 'linear-gradient(90deg,#FF6B00,#FF3D00)'
                      : 'rgba(255,107,0,0.45)',
                    boxShadow: isTop3 ? '0 0 8px rgba(255,107,0,0.6)' : 'none',
                  }}/>
                </div>
              </div>

              {/* Credits */}
              <div style={{
                width: 76, textAlign: 'right',
                fontSize: '0.7rem', fontWeight: 900, letterSpacing: 1,
                color: '#FFD700',
                textShadow: isTop3 ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
                position: 'relative',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <RamCoin size={13}/>{p.credits.toLocaleString()}
                </span>
              </div>

              {/* W/L */}
              <div style={{
                width: 56, textAlign: 'right',
                fontSize: '0.54rem', fontWeight: 900, letterSpacing: 1,
                position: 'relative',
              }}>
                <span style={{ color: 'rgba(76,255,0,0.75)' }}>{p.wins}W</span>
                <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 1px' }}>/</span>
                <span style={{ color: 'rgba(255,80,80,0.75)' }}>{p.losses}L</span>
              </div>

              {/* Win rate */}
              <div style={{
                width: 46, textAlign: 'right',
                fontSize: '0.62rem', fontWeight: 900, letterSpacing: 1,
                color: winRate >= 60
                  ? 'rgba(76,255,0,0.85)'
                  : winRate >= 40
                  ? 'rgba(255,215,0,0.8)'
                  : 'rgba(255,80,80,0.7)',
                position: 'relative',
              }}>
                {winRate}%
              </div>
            </button>
          )
        })}
      </div>

      <UserLedgerModal target={selected} onClose={() => setSelected(null)} />
    </>
  )
}
