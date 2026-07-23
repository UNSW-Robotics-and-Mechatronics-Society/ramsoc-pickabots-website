'use client'

import { Fragment, useMemo, useRef, useState, type CSSProperties } from 'react'
import { type BracketMatch, type Division, type TeamCount, findTeamTargetMatch, computeSlotDefaults } from '@/lib/mock-data'
import { type MatchSchedule, formatTime, applyScheduleStatus } from '@/lib/schedule'
import { useTeamFilter, isMatchDimmed, isMatchSelected } from '@/lib/teamFilter'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { MATCH_H, ROUND_W, MatchCard } from './BracketMatchCard'
import BracketZoomPan, { type BracketZoomPanHandle } from './BracketZoomPan'
import TeamFilterBar from './TeamFilterBar'
import TeamLedgerModal from './TeamLedgerModal'

// Table geometry. TIME_W is the fixed left "time" column; ring columns are a
// fixed card size — the table is panned/zoomed as a whole (see
// BracketZoomPan, shared with the bracket page) rather than scaled to fit
// the screen, so column widths no longer depend on container size.
const TIME_W  = 64
const COL_GAP = 10
const ROW_GAP = 8
// Fixed card scale, applied uniformly regardless of viewport — the zoom
// canvas (not this constant) is what makes cards bigger/smaller on screen.
const CARD_SCALE = 1.5

function pillStyle(active: boolean): CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 999, fontSize: '0.55rem', fontWeight: 900,
    letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? '#FF6B00' : 'rgba(255,255,255,0.5)',
  }
}

type ViewMode = Division | 'exhibition'

type Props = { matches: BracketMatch[]; teamCount: TeamCount; schedules: Record<Division, MatchSchedule> }

export default function MatchList({ matches, teamCount, schedules }: Props) {
  useRealtimeRefresh(['bracket_matches', 'bracket_config', 'bracket_schedule'])
  const [viewMode, setViewMode] = useState<ViewMode>('standards')
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const matchRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const zoomPanRef = useRef<BracketZoomPanHandle>(null)

  const isExhibition = viewMode === 'exhibition'

  // Ring-capped statuses (see applyScheduleStatus): at most one active + one
  // next per ring, matching the bracket and admin views. The bracket-round
  // view is scoped to one division; Exhibition combines both, since an
  // ad-hoc match can be added under either division's exhibition ring and
  // there's no reason to make the user pick a division just to see them.
  const divMatches = useMemo(() => {
    const divisions: Division[] = isExhibition ? ['standards', 'open'] : [viewMode as Division]
    return divisions.flatMap(d => applyScheduleStatus(matches, schedules[d], d).filter(m => m.division === d))
  }, [matches, schedules, viewMode, isExhibition])
  const matchById = useMemo(() => new Map(divMatches.map(m => [m.id, m])), [divMatches])
  const slotDefaults = useMemo(() => {
    const divisions: Division[] = isExhibition ? ['standards', 'open'] : [viewMode as Division]
    const merged = new Map<string, { a?: string; b?: string }>()
    for (const d of divisions) {
      for (const [k, v] of computeSlotDefaults(matches, d, teamCount)) merged.set(k, v)
    }
    return merged
  }, [matches, teamCount, viewMode, isExhibition])

  // Bracket view: this division's rings only, never exhibition ones (those
  // get their own tab instead of mixing into a division's view). Exhibition
  // view: every exhibition ring from BOTH divisions, labeled by source
  // division so it's clear which bracket an ad-hoc match was added under.
  const ringCols = isExhibition
    ? (['standards', 'open'] as Division[]).flatMap(d => (schedules[d].exhibitionRings ?? []).map((ring, i) => ({
        ring, label: `${d === 'standards' ? 'Standard' : 'Open'} Exhibition ${i + 1}`,
      })))
    : schedules[viewMode as Division].rings.map((ring, i) => ({ ring, label: `Ring ${i + 1}` }))
  const nRings = ringCols.length
  const maxLen = ringCols.reduce((mx, c) => Math.max(mx, c.ring.length), 0)
  const isEmpty = maxLen === 0

  const {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  } = useTeamFilter(divMatches, resolved => {
    // Pan/zoom the canvas onto the followed team's live/next/last match,
    // exactly like the bracket page's team filter.
    const target = findTeamTargetMatch(divMatches, resolved)
    const el = target && matchRefs.current[target.id]
    if (el) zoomPanRef.current?.focusOnMatch(el)
  })

  const rowH = MATCH_H * CARD_SCALE
  const cardW = ROUND_W * CARD_SCALE

  // Time shown per row: rings run the same slot cadence, so a row's time is
  // taken from whichever ring has an entry at that index.
  const timeForRow = (i: number): number | null => {
    for (const c of ringCols) if (c.ring[i]) return c.ring[i].startMinute
    return null
  }

  const headerCell: CSSProperties = {
    textTransform: 'uppercase', fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)', textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.12)',
  }

  const tableContent = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${TIME_W}px repeat(${nRings}, ${cardW}px)`,
      columnGap: COL_GAP, rowGap: ROW_GAP,
      alignItems: 'center', padding: '4px 16px 24px',
    }}>
      {/* Header row — pans/zooms with the rest of the content, same as the
          bracket page's "Winners Bracket" / "Ring 1" labels (nothing here
          is pinned to the viewport; the camera is what moves instead). */}
      <div style={headerCell}>Time</div>
      {ringCols.map((c, ri) => (
        <div key={`h-${ri}`} style={headerCell}>{c.label}</div>
      ))}

      {/* One row per slot index */}
      {Array.from({ length: maxLen }, (_, i) => {
        const minute = timeForRow(i)
        return (
          <Fragment key={`row-${i}`}>
            <div style={{
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
                      style={{ width: cardW, height: rowH }}
                    >
                      <div style={{ transform: `scale(${CARD_SCALE})`, transformOrigin: 'top left', width: ROUND_W, height: MATCH_H }}>
                        <MatchCard
                          match={match}
                          dimmed={isMatchDimmed(match, filterSet)}
                          selected={isMatchSelected(match, filterSet)}
                          defaults={slotDefaults.get(match.id)}
                          onTeamClick={setSelectedTeam}
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
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Header — title, division toggle, reset, team filter. zIndex/backdrop
          keep the team-filter dropdown above the zoom canvas below. */}
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
            {(['standards', 'open', 'exhibition'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={pillStyle(viewMode === v)}>
                {v === 'standards' ? 'Standard' : v === 'open' ? 'Open' : 'Exhibition'}
              </button>
            ))}
          </div>

          <button onClick={() => zoomPanRef.current?.resetView()} style={{ ...pillStyle(false), marginLeft: 'auto' }}>
            ⟲ Reset
          </button>
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

      {/* Table canvas — pinch/pan/zoom scoped to just this area, same
          mechanism as the bracket page. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {isEmpty ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>No matches scheduled</p>
          </div>
        ) : (
          <BracketZoomPan ref={zoomPanRef} key={viewMode} fitAxis="width">
            {tableContent}
          </BracketZoomPan>
        )}
      </div>

      <TeamLedgerModal
        target={selectedTeam ? { name: selectedTeam, division: isExhibition ? undefined : (viewMode as Division) } : null}
        onClose={() => setSelectedTeam(null)}
      />
    </div>
  )
}
