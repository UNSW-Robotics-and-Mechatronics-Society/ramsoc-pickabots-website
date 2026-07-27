'use client'
import { useState } from 'react'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import PlayerBoard, { type LeaderboardEntry } from './PlayerBoard'
import TeamBoard from './TeamBoard'
import type { TeamLeaderboardEntry } from '@/lib/types'

type Mode = 'players' | 'teams'

const MODE_TABS: { key: Mode; label: string }[] = [
  { key: 'players', label: 'Players' },
  { key: 'teams',   label: 'Teams' },
]

const SUBTITLE: Record<Mode, string> = {
  players: 'Sorted by ramcoins earned',
  teams:   'Sorted by ramcoins bet on',
}

type Props = { players: LeaderboardEntry[]; teams: TeamLeaderboardEntry[] }

export default function LeaderboardPage({ players, teams }: Props) {
  // Subscribe to `matches` (a game resolving → matches.winner_side changes),
  // `bracket_matches` (the same save's W/L and knocked-out status, which the
  // teams board reads) and `leaderboard_signal` (bumped on the non-game balance
  // changes: beg rewards, admin boosts/kicks — see bumpLeaderboardSignal).
  // Deliberately NOT `votes` or `users`, which change on every bet and would
  // churn constantly during voting — both boards hold still between games. The
  // ~4s interval is also a settle delay for the game path: payout credits to
  // users.tokens land just after matches.winner_side. Each trigger also
  // invalidates the leaderboard cache server-side, so the refresh reads fresh
  // standings rather than the cached snapshot.
  useRealtimeRefresh(['matches', 'bracket_matches', 'leaderboard_signal'], { intervalMs: 4000 })
  const [mode, setMode] = useState<Mode>('players')

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
          {SUBTITLE[mode]}
        </div>
      </div>

      {/* Players / Teams toggle */}
      <div style={{
        display: 'flex', gap: 8, padding: '12px 16px',
        background: 'rgba(4,2,12,0.62)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        {MODE_TABS.map(tab => {
          const active = mode === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setMode(tab.key)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', font: 'inherit',
                fontSize: '0.58rem', fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase',
                border: `1px solid ${active ? 'rgba(255,107,0,0.45)' : 'rgba(255,255,255,0.1)'}`,
                background: active
                  ? 'linear-gradient(135deg, rgba(255,107,0,0.22) 0%, rgba(255,61,0,0.12) 100%)'
                  : 'rgba(255,255,255,0.03)',
                color: active ? '#FF6B00' : 'rgba(255,255,255,0.4)',
                textShadow: active ? '0 0 12px rgba(255,107,0,0.4)' : 'none',
                boxShadow: active ? '0 0 18px rgba(255,107,0,0.12)' : 'none',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Each board owns its own search + modal state; switching tabs unmounts
          the other, so picks don't leak between boards. */}
      {mode === 'players'
        ? <PlayerBoard players={players} />
        : <TeamBoard teams={teams} />}

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
