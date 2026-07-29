'use client'

import { Fragment, useMemo, useRef, useState, type CSSProperties } from 'react'
import { type BracketMatch, type Division, type TeamCount, findTeamTargetMatch, computeSlotDefaults } from '@/lib/mock-data'
import { type MatchSchedule, type ExhibitionSchedule, formatTime, applyScheduleStatus } from '@/lib/schedule'
import { useTeamFilter, isMatchDimmed, isMatchSelected } from '@/lib/teamFilter'
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh'
import { MATCH_H, ROUND_W, MatchCard } from './BracketMatchCard'
import BracketZoomPan, { type BracketZoomPanHandle } from './BracketZoomPan'
import TeamFilterBar from './TeamFilterBar'
import TeamLedgerModal from './TeamLedgerModal'

// Table geometry. Every ring is a TIME_W time column followed by a fixed-size
// card column (one axis per ring, as in the admin panel) — the table is
// panned/zoomed as a whole (see BracketZoomPan, shared with the bracket page)
// rather than scaled to fit the screen, so column widths no longer depend on
// container size.
// Same width as the admin panel's per-ring axis, so "12:05 PM" fits without
// wrapping while the right-aligned time still sits close to its own card
// (rather than drifting toward the ring on its left).
const TIME_W  = 56
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

type Props = {
  matches: BracketMatch[]
  // Per division — Standards and Open can run different bracket sizes.
  teamCounts: Record<Division, TeamCount>
  schedules: Record<Division, MatchSchedule>
  // Shared across both divisions — not one copy per division. See
  // ExhibitionSchedule.
  exhibitionSchedule: ExhibitionSchedule
}

export default function MatchList({ matches, teamCounts, schedules, exhibitionSchedule }: Props) {
  useRealtimeRefresh(['bracket_matches', 'bracket_config', 'bracket_schedule'])
  const [viewMode, setViewMode] = useState<ViewMode>('standards')
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const matchRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const zoomPanRef = useRef<BracketZoomPanHandle>(null)

  const isExhibition = viewMode === 'exhibition'

  // Bracket-round view: ring-capped statuses (see applyScheduleStatus) — at
  // most one active + one next per ring, matching the bracket and admin
  // views, scoped to one division. Exhibition view: the single shared list,
  // not divided by division at all, with status entirely admin-controlled
  // (no ring-position derivation — see applyScheduleStatus's exhibition
  // exemption) so it shows exactly what the admin set.
  const divMatches = useMemo(() => {
    if (isExhibition) return matches.filter(m => m.side === 'exhibition')
    const division = viewMode as Division
    return applyScheduleStatus(matches, schedules[division], division).filter(m => m.division === division)
  }, [matches, schedules, viewMode, isExhibition])
  const matchById = useMemo(() => new Map(divMatches.map(m => [m.id, m])), [divMatches])
  // Feeder placeholder text for empty slots — bracket-round only; exhibition
  // matches have no feeders.
  const slotDefaults = useMemo(
    () => isExhibition
      ? new Map<string, { a?: string; b?: string }>()
      : computeSlotDefaults(matches, viewMode as Division, teamCounts[viewMode as Division]),
    [matches, teamCounts, viewMode, isExhibition],
  )

  // Bracket view: this division's rings only, never exhibition ones (those
  // get their own tab instead of mixing into a division's view). Exhibition
  // view: the single shared exhibition ring set.
  const ringCols = isExhibition
    ? exhibitionSchedule.rings.map((ring, i) => ({ ring, label: `Exhibition ${i + 1}` }))
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

  const headerCell: CSSProperties = {
    textTransform: 'uppercase', fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)', textAlign: 'center',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.12)',
  }

  const tableContent = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${nRings}, ${TIME_W}px ${cardW}px)`,
      columnGap: COL_GAP, rowGap: ROW_GAP,
      alignItems: 'center', padding: '4px 16px 24px',
    }}>
      {/* Header row — pans/zooms with the rest of the content, same as the
          bracket page's "Winners Bracket" / "Ring 1" labels (nothing here
          is pinned to the viewport; the camera is what moves instead). Each
          label spans its ring's time + card columns. */}
      {ringCols.map((c, ri) => (
        <div key={`h-${ri}`} style={{ ...headerCell, gridColumn: 'span 2' }}>{c.label}</div>
      ))}

      {/* One row per slot index */}
      {Array.from({ length: maxLen }, (_, i) => {
        return (
          <Fragment key={`row-${i}`}>
            {/* Per ring: its own time cell, then its card. Every ring carries
                its own axis (as the admin panel does) because rings are
                independent queues whose times drift apart — a completed match
                stays frozen at the time it played, a hand-set time is pinned,
                and a ring added mid-event starts from "now" (see retimeRings).
                One shared column per row would have to pick one ring's time
                and show it against every other ring's match. */}
            {ringCols.map((c, ri) => {
              const entry = c.ring[i]
              const match = entry ? matchById.get(entry.matchId) : undefined
              return (
                <Fragment key={`c-${ri}-${i}`}>
                  <div style={{
                    height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    paddingRight: 6, whiteSpace: 'nowrap',
                    fontSize: '0.62rem', fontWeight: 800, letterSpacing: 0.5,
                    color: 'rgba(255,215,0,0.75)',
                  }}>
                    {entry && match ? formatTime(entry.startMinute) : ''}
                  </div>

                  <div style={{ height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {entry && match ? (
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
                </Fragment>
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
          <BracketZoomPan ref={zoomPanRef} key={viewMode} fitAxis="width" momentum>
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
