'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { type BracketMatch, type Division, type TeamCount, findTeamTargetMatch, computeSlotDefaults } from '@/lib/mock-data'
import { type MatchSchedule, formatTime, applyScheduleStatus } from '@/lib/schedule'
import { useTeamFilter, isMatchDimmed, isMatchSelected } from '@/lib/teamFilter'
import { MATCH_H, ROUND_W, MatchCard } from './BracketMatchCard'
import TeamFilterBar from './TeamFilterBar'

// Table geometry. TIME_W is the fixed left "time" column; ring columns share
// the remaining width equally. Cards are scaled up from their intrinsic
// bracket size to fill their column (and stay readable) — clamped so they
// never get smaller than intrinsic nor absurdly large on very wide screens.
const TIME_W       = 64
const COL_GAP      = 10
const ROW_GAP      = 8
const MIN_SCALE    = 1.5
const MAX_SCALE    = 3
const H_PADDING    = 16 // matches the scroll container's horizontal padding

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

export default function MatchList({ matches, teamCount, schedules }: Props) {
  const [division, setDivision] = useState<Division>('standards')
  const matchRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track the scroll container's width so ring columns can be scaled to fill
  // it — the whole point of the new table is that it fits the screen width
  // (no horizontal scrolling), so cards grow/shrink to match.
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const schedule = schedules[division]
  // Ring-capped statuses (see applyScheduleStatus): at most one active + one
  // next per ring, matching the bracket and admin views.
  const divMatches = useMemo(
    () => applyScheduleStatus(matches, schedule, division).filter(m => m.division === division),
    [matches, schedule, division],
  )
  const matchById = useMemo(() => new Map(divMatches.map(m => [m.id, m])), [divMatches])
  const slotDefaults = useMemo(() => computeSlotDefaults(matches, division, teamCount), [matches, division, teamCount])
  // Bracket rings then dedicated exhibition rings, shown as extra columns.
  const ringCols = [
    ...schedule.rings.map((ring, i) => ({ ring, label: `Ring ${i + 1}` })),
    ...(schedule.exhibitionRings ?? []).map((ring, i) => ({ ring, label: `Exhibition ${i + 1}` })),
  ]
  const nRings = ringCols.length
  const maxLen = ringCols.reduce((mx, c) => Math.max(mx, c.ring.length), 0)
  const isEmpty = maxLen === 0

  const {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  } = useTeamFilter(divMatches, resolved => {
    // Scroll the followed team's live/next/last match into view instead of
    // panning a canvas.
    const target = findTeamTargetMatch(divMatches, resolved)
    const el = target && matchRefs.current[target.id]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })

  // Card scale: fill each ring column with the card, clamped. Falls back to
  // MIN_SCALE until the container has been measured.
  const cellW = nRings > 0 && containerW > 0
    ? (containerW - 2 * H_PADDING - TIME_W - nRings * COL_GAP) / nRings
    : 0
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cellW > 0 ? cellW / ROUND_W : MIN_SCALE))
  const rowH = MATCH_H * scale

  // Time shown per row: rings run the same slot cadence, so a row's time is
  // taken from whichever ring has an entry at that index.
  const timeForRow = (i: number): number | null => {
    for (const c of ringCols) if (c.ring[i]) return c.ring[i].startMinute
    return null
  }

  const headerCell: CSSProperties = {
    position: 'sticky', top: 0, zIndex: 3,
    background: 'rgba(4,2,12,0.95)',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    textTransform: 'uppercase', fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)', textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '8px 0',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Header — title, division toggle, team filter. zIndex/backdrop keep
          the team-filter dropdown above the scrolling table below. */}
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

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {(['standards', 'open'] as Division[]).map(d => (
            <button key={d} onClick={() => setDivision(d)} style={pillStyle(division === d)}>
              {d === 'standards' ? 'Standard' : 'Open'}
            </button>
          ))}
        </div>

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

      {/* Table — native vertical scroll only (no left/right), sticky Ring
          headers + sticky Time column. Rows are uniform height (one per slot),
          not spaced proportionally to clock time. */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto', overflowX: 'hidden',
          touchAction: 'pan-y',
          padding: `0 ${H_PADDING}px 88px`,
        }}
      >
        {isEmpty ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>No matches scheduled</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `${TIME_W}px repeat(${nRings}, 1fr)`,
            columnGap: COL_GAP, rowGap: ROW_GAP,
            alignItems: 'center',
          }}>
            {/* Header row */}
            <div style={{ ...headerCell, left: 0, zIndex: 4 }}>Time</div>
            {ringCols.map((c, ri) => (
              <div key={`h-${ri}`} style={headerCell}>{c.label}</div>
            ))}

            {/* One row per slot index */}
            {Array.from({ length: maxLen }, (_, i) => {
              const minute = timeForRow(i)
              return (
                <Fragment key={`row-${i}`}>
                  {/* Time cell — sticky to the left edge, scrolls vertically with its row */}
                  <div style={{
                    position: 'sticky', left: 0, zIndex: 1,
                    height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    paddingRight: 6,
                    fontSize: '0.62rem', fontWeight: 800, letterSpacing: 0.5,
                    color: 'rgba(255,215,0,0.75)',
                  }}>
                    {minute === null ? '' : formatTime(minute)}
                  </div>

                  {/* One card cell per ring */}
                  {ringCols.map((c, ri) => {
                    const entry = c.ring[i]
                    const match = entry ? matchById.get(entry.matchId) : undefined
                    return (
                      <div key={`c-${ri}-${i}`} style={{ height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {match ? (
                          <div
                            ref={el => { matchRefs.current[match.id] = el }}
                            style={{ width: ROUND_W * scale, height: MATCH_H * scale }}
                          >
                            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: ROUND_W, height: MATCH_H }}>
                              <MatchCard
                                match={match}
                                dimmed={isMatchDimmed(match, filterSet)}
                                selected={isMatchSelected(match, filterSet)}
                                defaults={slotDefaults.get(match.id)}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </Fragment>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
