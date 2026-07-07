'use client'

import { useState } from 'react'
import {
  type BracketMatch, type Division, type TeamCount,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel, winner,
} from '@/lib/mock-data'

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

const STATUS_LABEL: Record<BracketMatch['status'], string> = {
  todo: '· · ·', next: 'NEXT', active: '● LIVE', completed: '✓ DONE', skipped: 'SKIPPED',
}
const STATUS_COLOR: Record<BracketMatch['status'], string> = {
  todo: 'rgba(255,255,255,0.2)', next: '#FFD700', active: '#FF6B00',
  completed: 'rgba(76,255,0,0.6)', skipped: 'rgba(255,80,80,0.7)',
}

function matchLabel(m: BracketMatch, teamCount: TeamCount): string {
  if (m.side === 'finals-semi')  return `Semi ${m.matchNumber}`
  if (m.side === 'finals-third') return '3rd Place'
  if (m.side === 'finals-final') return 'Final'
  const total = m.side === 'winners' ? wbRoundsFor(teamCount) : lbRoundsFor(teamCount)
  return m.side === 'winners' ? wbRoundLabel(m.round, total) : lbRoundLabel(m.round, total)
}

function Slot({ name, score, won, lost }: { name: string; score: number; won: boolean; lost: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 10px',
      background: won ? 'rgba(255,107,0,0.13)' : 'transparent',
    }}>
      <span style={{
        fontSize: '0.6rem', fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase',
        color: won ? '#fff' : lost ? 'rgba(255,255,255,0.35)' : 'rgba(210,210,210,0.85)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {name || 'TBD'}
      </span>
      <span style={{
        fontSize: '0.65rem', fontWeight: 900, color: won ? '#FF6B00' : 'rgba(255,255,255,0.4)',
      }}>
        {score}
      </span>
    </div>
  )
}

function MatchCard({ match, teamCount }: { match: BracketMatch; teamCount: TeamCount }) {
  const w = winner(match)
  return (
    <div style={{
      width: 168,
      background: 'rgba(6,3,16,0.88)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${match.status === 'active' ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 10, overflow: 'hidden', position: 'relative',
      boxShadow: match.status === 'active' ? '0 0 24px rgba(255,107,0,0.22)' : '0 4px 16px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: GRAIN, backgroundSize: '140px 140px', opacity: 0.05,
      }} />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: '0.4rem', fontWeight: 900, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          {matchLabel(match, teamCount)}
        </span>
        <span style={{ fontSize: '0.4rem', fontWeight: 900, letterSpacing: 1, color: STATUS_COLOR[match.status] }}>
          {STATUS_LABEL[match.status]}
        </span>
      </div>
      <Slot name={match.slotA.teamName} score={match.slotA.score} won={w === 'a'} lost={w === 'b'} />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
      <Slot name={match.slotB.teamName} score={match.slotB.score} won={w === 'b'} lost={w === 'a'} />
    </div>
  )
}

function BracketColumns({ matches, teamCount, side }: { matches: BracketMatch[]; teamCount: TeamCount; side: 'winners' | 'losers' }) {
  const sideMatches = matches.filter(m => m.side === side)
  const rounds = [...new Set(sideMatches.map(m => m.round))].sort((a, b) => a - b)
  if (rounds.length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
      {rounds.map(round => {
        const roundMatches = sideMatches
          .filter(m => m.round === round)
          .sort((a, b) => a.matchNumber - b.matchNumber)
        return (
          <div key={round} style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            {roundMatches.map(m => <MatchCard key={m.id} match={m} teamCount={teamCount} />)}
          </div>
        )
      })}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.5rem', fontWeight: 900, letterSpacing: 4, color: 'rgba(255,107,0,0.55)',
      textTransform: 'uppercase', margin: '18px 0 8px',
    }}>
      {children}
    </div>
  )
}

type Props = { matches: BracketMatch[]; teamCount: TeamCount }

export default function BracketPage({ matches, teamCount }: Props) {
  const [division, setDivision] = useState<Division>('standards')
  const divMatches = matches.filter(m => m.division === division)
  const semis = divMatches.filter(m => m.side === 'finals-semi').sort((a, b) => a.matchNumber - b.matchNumber)
  const third = divMatches.find(m => m.side === 'finals-third')
  const final = divMatches.find(m => m.side === 'finals-final')

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 88 }}>
      {/* Page header */}
      <div style={{
        padding: '28px 16px 20px',
        background: 'rgba(4,2,12,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,107,0,0.12)',
      }}>
        <div style={{
          fontSize: '0.42rem', letterSpacing: 8, fontWeight: 900,
          color: 'rgba(255,107,0,0.5)', textTransform: 'uppercase', marginBottom: 6,
        }}>
          ◆ PICKABOTS 2026 ◆
        </div>
        <div style={{
          fontSize: '1.6rem', fontWeight: 900, letterSpacing: 4,
          color: '#FF6B00', textTransform: 'uppercase',
          textShadow: '0 0 24px rgba(255,107,0,0.5), 0 0 48px rgba(255,60,0,0.2)',
        }}>
          BRACKET
        </div>

        {/* Division toggle */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {(['standards', 'open'] as Division[]).map(d => (
            <button
              key={d}
              onClick={() => setDivision(d)}
              style={{
                padding: '5px 14px', borderRadius: 999, fontSize: '0.55rem', fontWeight: 900,
                letterSpacing: 2, textTransform: 'uppercase', cursor: 'pointer',
                border: `1px solid ${division === d ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
                background: division === d ? 'rgba(255,107,0,0.15)' : 'rgba(255,255,255,0.04)',
                color: division === d ? '#FF6B00' : 'rgba(255,255,255,0.4)',
              }}
            >
              {d === 'standards' ? 'Standard' : 'Open'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '4px 16px 28px' }}>
        <SectionLabel>Winners Bracket</SectionLabel>
        <BracketColumns matches={divMatches} teamCount={teamCount} side="winners" />

        <SectionLabel>Losers Bracket</SectionLabel>
        <BracketColumns matches={divMatches} teamCount={teamCount} side="losers" />

        <SectionLabel>Finals Day</SectionLabel>
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            {semis.map(m => <MatchCard key={m.id} match={m} teamCount={teamCount} />)}
          </div>
          {third && (
            <div style={{ flexShrink: 0 }}>
              <MatchCard match={third} teamCount={teamCount} />
            </div>
          )}
          {final && (
            <div style={{ flexShrink: 0 }}>
              <MatchCard match={final} teamCount={teamCount} />
            </div>
          )}
        </div>
      </div>

      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
