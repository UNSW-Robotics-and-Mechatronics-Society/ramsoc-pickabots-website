'use client'
import RamCoin from './RamCoin'

interface Player {
  rank: number
  name: string
  credits: number
  wins: number
  losses: number
}

type LeaderboardEntry = { id: string; name: string; tokens: number; wins: number; losses: number }

const MEDAL = ['🥇', '🥈', '🥉']

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

type Props = { players: LeaderboardEntry[] }

export default function LeaderboardPage({ players }: Props) {
  const PLAYERS: Player[] = players.map((p, i) => ({
    rank: i + 1,
    name: p.name,
    credits: p.tokens,
    wins: p.wins,
    losses: p.losses,
  }))

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 88 }}>
      {/* Page header */}
      <div style={{
        padding: '28px 16px 20px',
        background: 'rgba(4,2,12,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,107,0,0.12)',
      }}>
        <div style={{
          fontSize: '0.42rem', letterSpacing: 8, fontWeight: 900,
          color: 'rgba(255,107,0,0.5)', textTransform: 'uppercase', marginBottom: 6,
        }}>
          ◆ SEASON 1 ◆
        </div>
        <div style={{
          fontSize: '1.6rem', fontWeight: 900, letterSpacing: 4,
          color: '#FF6B00', textTransform: 'uppercase',
          textShadow: '0 0 24px rgba(255,107,0,0.5), 0 0 48px rgba(255,60,0,0.2)',
        }}>
          RANKINGS
        </div>
        <div style={{
          fontSize: '0.5rem', letterSpacing: 4, color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase', marginTop: 4, fontWeight: 900,
        }}>
          Sorted by ramcoins earned
        </div>
      </div>

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
        <span style={{ flex: 1 }}>Pilot</span>
        <span style={{ width: 76, textAlign: 'right' }}>Ramcoins</span>
        <span style={{ width: 56, textAlign: 'right' }}>W / L</span>
        <span style={{ width: 46, textAlign: 'right' }}>Rate</span>
      </div>

      {/* Player rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' }}>
        {PLAYERS.map(p => {
          const winRate = p.wins + p.losses > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0
          const isTop3  = p.rank <= 3
          return (
            <div key={p.rank} style={{
              position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center',
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
            </div>
          )
        })}
      </div>

      <div style={{
        textAlign: 'center', padding: '18px 0 8px',
        fontSize: '0.4rem', letterSpacing: 4,
        color: 'rgba(255,255,255,0.12)',
        textTransform: 'uppercase', fontWeight: 900,
      }}>
        ◆ Updates after each resolved match ◆
      </div>
    </div>
  )
}
