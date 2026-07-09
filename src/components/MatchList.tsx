'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { type BracketMatch, type Division, type TeamCount, findTeamTargetMatch } from '@/lib/mock-data'
import { type MatchSchedule, START_MINUTE, formatTime } from '@/lib/schedule'
import { useTeamFilter, isMatchDimmed } from '@/lib/teamFilter'
import { MATCH_H, ROUND_W, MatchCard } from './BracketMatchCard'
import TeamFilterBar from './TeamFilterBar'
import BracketZoomPan, { type BracketZoomPanHandle } from './BracketZoomPan'

// ── layout constants — same ring/axis idea as the admin Match List panel,
// just sized around the smaller public MatchCard and with no editing.
const AXIS_W   = 46
const RING_W   = ROUND_W + 12
const HEADER_H = 20
const CARD_H   = MATCH_H

function pillStyle(active: boolean): CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 999, fontSize: '0.55rem', fontWeight: 900,
    letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? '#FF6B00' : 'rgba(255,255,255,0.5)',
  }
}

type Props = { matches: BracketMatch[]; teamCount: TeamCount; schedules: Record<Division, MatchSchedule> }

export default function MatchList({ matches, schedules }: Props) {
  const [division, setDivision] = useState<Division>('standards')
  const matchRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const zoomPanRef = useRef<BracketZoomPanHandle>(null)

  const divMatches = useMemo(() => matches.filter(m => m.division === division), [matches, division])
  const matchById = new Map(divMatches.map(m => [m.id, m]))
  const schedule = schedules[division]

  const {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  } = useTeamFilter(divMatches, resolved => {
    const target = findTeamTargetMatch(divMatches, resolved)
    const el = target && matchRefs.current[target.id]
    if (el) zoomPanRef.current?.focusOnMatch(el)
  })

  // Same shared-axis approach as the admin Match List panel: one scale and
  // one start-time reference across every ring, so a given clock time lines
  // up at the same row everywhere, derived from the fixed card height so a
  // match's box always exactly fills its own slot.
  const allEntries = schedule.rings.flat()
  const isEmpty = allEntries.length === 0
  const starts = allEntries.map(e => e.startMinute)
  const globalStart = starts.length ? Math.min(...starts) : START_MINUTE
  const globalEnd = starts.length
    ? Math.max(...starts) + schedule.matchMinutes + schedule.gapMinutes
    : globalStart + schedule.matchMinutes + schedule.gapMinutes
  const totalMinutes = Math.max(1, globalEnd - globalStart)
  const pxPerMin = CARD_H / schedule.matchMinutes
  const canvasH = totalMinutes * pxPerMin
  const yFor = (minute: number) => (minute - globalStart) * pxPerMin

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 88 }}>
      {/* Page header — position+zIndex is deliberate: backdropFilter below
          creates its own stacking context, which otherwise traps the team
          filter's dropdown (position: absolute, overflows past this box)
          behind the canvas sibling underneath, since that sibling comes
          later in DOM order. This keeps the whole header (dropdown and
          all) painted — and clickable — above the canvas. */}
      <div style={{
        flexShrink: 0, position: 'relative', zIndex: 5, padding: '28px 16px 8px',
        background: 'rgba(4,2,12,0.7)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,107,0,0.12)',
      }}>
        <div style={{ fontSize: '0.42rem', letterSpacing: 8, fontWeight: 900, color: 'rgba(255,107,0,0.5)', textTransform: 'uppercase', marginBottom: 6 }}>
          ◆ PICKABOTS 2026 ◆
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: 4, color: '#FF6B00', textTransform: 'uppercase', textShadow: '0 0 24px rgba(255,107,0,0.5), 0 0 48px rgba(255,60,0,0.2)' }}>
          MATCH LIST
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['standards', 'open'] as Division[]).map(d => (
              <button key={d} onClick={() => setDivision(d)} style={pillStyle(division === d)}>
                {d === 'standards' ? 'Standard' : 'Open'}
              </button>
            ))}
          </div>

          <button onClick={() => zoomPanRef.current?.resetView()} style={{ ...pillStyle(false), marginLeft: 'auto' }}>
            ⟲ Reset View
          </button>
        </div>

        {/* Team filter — type/pick a team to dim every other match and
            scroll straight to their live/next/last match. View-only: this
            only dims and scrolls, nothing here can be edited. */}
        <div style={{ marginTop: 8 }}>
          <TeamFilterBar
            teamInput={teamInput}
            onInputChange={setTeamInput}
            showSuggestions={showSuggestions}
            setShowSuggestions={setShowSuggestions}
            teamSuggestions={teamSuggestions}
            teamFilters={teamFilters}
            onAdd={addTeamFilter}
            onRemove={removeTeamFilter}
          />
        </div>
      </div>

      {/* Match list canvas — pinch/pan/zoom scoped to just this area, same
          as the bracket page. Defaults to fitting (and centering) every
          ring on screen, since there's no round to jump to here. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {isEmpty ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>No matches scheduled</p>
          </div>
        ) : (
          <BracketZoomPan ref={zoomPanRef} key={division}>
            <div style={{ display: 'flex', alignItems: 'flex-start', padding: 20 }}>
              {schedule.rings.map((ring, ri) => (
                <div key={ri} style={{ display: 'flex', flexShrink: 0, flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{
                    height: HEADER_H, lineHeight: `${HEADER_H}px`,
                    width: AXIS_W + RING_W, textAlign: 'center', textTransform: 'uppercase',
                    fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2, color: 'rgba(255,255,255,0.4)',
                    background: 'rgba(4,2,12,0.85)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                  }}>
                    Ring {ri + 1}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 10 }}>
                    {/* this ring's own read-only time axis — same scale as every other ring */}
                    <div style={{ position: 'relative', flexShrink: 0, width: AXIS_W, height: canvasH }}>
                      {ring.map(entry => (
                        <div
                          key={entry.matchId}
                          style={{
                            position: 'absolute', right: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            top: yFor(entry.startMinute) + (CARD_H - 16) / 2, height: 16,
                          }}
                        >
                          <span style={{ fontSize: '0.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
                            {formatTime(entry.startMinute)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* this ring's matches */}
                    <div style={{ position: 'relative', flexShrink: 0, width: RING_W, height: canvasH }}>
                      {ring.map(entry => {
                        const match = matchById.get(entry.matchId)
                        if (!match) return null
                        return (
                          <div
                            key={match.id}
                            ref={el => { matchRefs.current[match.id] = el }}
                            style={{ position: 'absolute', left: 6, top: yFor(entry.startMinute) }}
                          >
                            <MatchCard
                              match={match}
                              time={formatTime(entry.startMinute)}
                              dimmed={isMatchDimmed(match, filterSet)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </BracketZoomPan>
        )}
      </div>
    </div>
  )
}
