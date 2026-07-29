'use client'
import Link from 'next/link'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import type { Division } from '@/lib/mock-data'

type Team = { id: string; name: string; division: Division }

type UpcomingTeamMatch = {
  matchId: string
  opponentName: string
  roundLabel: string
  time: string | null
  isExhibition: boolean
}

const DIVISION_COLOR: Record<Division, string> = { standards: '#FF6B00', open: '#4cff00' }

type Props = { team: Team | null; matches: UpcomingTeamMatch[] }

export default function MyMatchesPage({ team, matches }: Props) {
  // Ring/schedule edits (admin) and match results both change when a team's
  // upcoming slot or opponent shifts — same table set MatchList subscribes to.
  useRealtimeRefresh(['bracket_matches', 'bracket_config', 'bracket_schedule'])

  const accent = team ? DIVISION_COLOR[team.division] : '#FF6B00'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{
          fontSize: '0.42rem', letterSpacing: 8, fontWeight: 900,
          color: 'rgba(255,107,0,0.5)', textTransform: 'uppercase', marginBottom: 6,
        }}>
          ◆ YOUR TEAM ◆
        </div>
        <div style={{
          fontSize: '1.4rem', fontWeight: 900, letterSpacing: 3,
          color: accent, textTransform: 'uppercase',
          textShadow: `0 0 24px color-mix(in srgb, ${accent} 50%, transparent)`,
        }}>
          {team ? team.name : 'My Matches'}
        </div>
        {team && (
          <div style={{
            fontSize: '0.5rem', letterSpacing: 4, color: 'rgba(255,255,255,0.35)',
            textTransform: 'uppercase', marginTop: 4, fontWeight: 900,
          }}>
            {team.division} division
          </div>
        )}
      </div>

      {!team && (
        <div className="glass" style={{ borderRadius: 14, padding: '20px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0 }}>
            You&apos;re not linked to a competing team yet. If you&apos;re on a team, link it during
            onboarding to see your upcoming match times here.
          </p>
          <Link
            href="/onboarding"
            style={{
              display: 'inline-block', marginTop: 14, padding: '9px 20px', borderRadius: 999,
              fontSize: '0.6rem', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase',
              color: '#06080b', background: '#FF6B00', textDecoration: 'none',
            }}
          >
            Link my team
          </Link>
        </div>
      )}

      {team && matches.length === 0 && (
        <div className="glass" style={{ borderRadius: 14, padding: '20px 18px', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            No upcoming matches scheduled right now — check back later.
          </p>
        </div>
      )}

      {team && matches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {matches.map((m, i) => (
            <div
              key={m.matchId}
              className="glass"
              style={{
                borderRadius: 14, padding: '14px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                border: i === 0 ? `1px solid color-mix(in srgb, ${accent} 45%, transparent)` : undefined,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: '0.44rem', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase',
                  color: i === 0 ? accent : 'rgba(255,255,255,0.4)', marginBottom: 4,
                }}>
                  {i === 0 ? 'Up next · ' : ''}{m.isExhibition ? 'Exhibition' : m.roundLabel}
                </div>
                <div style={{
                  fontSize: '0.8rem', fontWeight: 900, color: '#fff', letterSpacing: 0.5,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  vs {m.opponentName}
                </div>
              </div>
              <div style={{
                flexShrink: 0, fontSize: '0.72rem', fontWeight: 900, letterSpacing: 0.5,
                color: m.time ? '#FFD700' : 'rgba(255,255,255,0.3)',
              }}>
                {m.time ?? 'TBD'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
