'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  type BracketMatch, type Division, type TeamCount,
  wbRoundsFor, lbRoundsFor, lbRoundLabel, winner, findTeamTargetMatch, computeSlotDefaults,
} from '@/lib/mock-data'
import { type MatchSchedule, formatTime, applyScheduleStatus } from '@/lib/schedule'
import { useTeamFilter, isMatchDimmed, isMatchSelected } from '@/lib/teamFilter'
import { useAdminPanels } from '@/components/admin/AdminPanelContext'
import BracketZoomPan, { type BracketZoomPanHandle, type FocusTarget } from './BracketZoomPan'
import { ROUND_W, CONN_W, SLOT_H, MatchCard } from './BracketMatchCard'
import TeamFilterBar from './TeamFilterBar'

const PODIUM_W = 130
// Deliberately large — an obvious visual break between the Winners and
// Losers boxes when both are shown together (All / Knockouts).
const SIDE_GAP = 56
// How much of the NEXT round's column should peek into view when a
// round-of-N button is pressed, on top of the target round's own width.
const PEEK_FRACTION = 0.25
const PEEK_WIDTH = CONN_W + PEEK_FRACTION * ROUND_W

function sectionH(r1Matches: number) { return r1Matches * SLOT_H }

function pillStyle(active: boolean): CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 999, fontSize: '0.55rem', fontWeight: 900,
    letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.12)'}`,
    background: active ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? '#FF6B00' : 'rgba(255,255,255,0.5)',
  }
}

// ── connector lines between rounds ──────────────────────────────────────────
function ConnectorSVG({ fromMatches, height }: { fromMatches: BracketMatch[]; height: number }) {
  const fromN   = fromMatches.length
  const pairs   = fromN / 2
  const spacing = height / fromN
  const cx      = CONN_W / 2
  const DONE = 'rgba(76,255,0,0.7)'
  const BASE = 'rgba(255,255,255,0.2)'

  return (
    <svg width={CONN_W} height={height} style={{ flexShrink: 0, overflow: 'visible' }}>
      {Array.from({ length: pairs }, (_, i) => {
        const m1       = fromMatches[2 * i]
        const m2       = fromMatches[2 * i + 1]
        const m1Done   = m1?.status === 'completed'
        const m2Done   = m2?.status === 'completed'
        const bothDone = m1Done && m2Done
        const y1   = spacing * (2 * i + 0.5)
        const y2   = spacing * (2 * i + 1.5)
        const midY = (y1 + y2) / 2
        const c = (done: boolean) => done ? DONE : BASE
        return (
          <g key={i}>
            <line x1={0}   y1={y1}   x2={cx}     y2={y1}   stroke={c(m1Done)}   strokeWidth={1.5} />
            <line x1={cx}  y1={y1}   x2={cx}     y2={y2}   stroke={c(bothDone)} strokeWidth={1.5} />
            <line x1={0}   y1={y2}   x2={cx}     y2={y2}   stroke={c(m2Done)}   strokeWidth={1.5} />
            <line x1={cx}  y1={midY} x2={CONN_W} y2={midY} stroke={c(bothDone)} strokeWidth={1.5} />
          </g>
        )
      })}
    </svg>
  )
}

type RegisterMatchRef = (id: string, el: HTMLDivElement | null) => void

function RoundColumn({
  matches, height, registerRef, filterSet, times, slotDefaults,
}: {
  matches: BracketMatch[]; height: number; registerRef?: RegisterMatchRef
  filterSet?: Set<string>; times: Map<string, number>; slotDefaults?: Map<string, { a?: string; b?: string }>
}) {
  return (
    <div style={{ width: ROUND_W, height, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flexShrink: 0 }}>
      {matches.map(m => (
        // Every match gets a ref, not just the round's topmost one — the
        // round-of-N jump needs the topmost match (see getFocusElement),
        // and the team-filter jump needs to reach an arbitrary match
        // anywhere in the bracket, so one shared id-keyed registry covers
        // both instead of two separate ref schemes.
        <div key={m.id} ref={registerRef ? (el) => registerRef(m.id, el) : undefined}>
          <MatchCard
            match={m}
            time={times.has(m.id) ? formatTime(times.get(m.id)!) : undefined}
            dimmed={!!filterSet?.size && !filterSet.has(m.slotA.teamName) && !filterSet.has(m.slotB.teamName)}
            selected={!!filterSet?.size && (filterSet.has(m.slotA.teamName) || filterSet.has(m.slotB.teamName))}
            defaults={slotDefaults?.get(m.id)}
          />
        </div>
      ))}
    </div>
  )
}

function BracketStrip({
  rounds, matchesByRound, height, registerRef, filterSet, times, slotDefaults,
}: {
  rounds: number[]; matchesByRound: BracketMatch[][]; height: number; registerRef?: RegisterMatchRef
  filterSet?: Set<string>; times: Map<string, number>; slotDefaults?: Map<string, { a?: string; b?: string }>
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height }}>
      {rounds.map((round, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'stretch' }}>
          <RoundColumn matches={matchesByRound[i]} height={height} registerRef={registerRef} filterSet={filterSet} times={times} slotDefaults={slotDefaults} />
          {i < rounds.length - 1 && matchesByRound[i].length >= 2 && (
            <ConnectorSVG fromMatches={matchesByRound[i]} height={height} />
          )}
          {i < rounds.length - 1 && matchesByRound[i].length < 2 && (
            <div style={{ width: CONN_W, flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  )
}

type BracketView = 'all' | 'winners' | 'losers' | 'knockouts' | 'finals'
const FILTERS: { value: BracketView; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'winners', label: 'Winners' },
  { value: 'losers', label: 'Losers' },
  { value: 'knockouts', label: 'Knockouts' },
  { value: 'finals', label: 'Finals' },
]

type Props = { matches: BracketMatch[]; teamCount: TeamCount; schedules: Record<Division, MatchSchedule> }

// A single round (Winners or Losers, whichever the current side-filter
// means) or "finals" (Grand Final + 3rd place + podium, for Winners/All/
// Knockouts; the Losers Final for Losers — both land on the same gold box).
type RoundSelection = number | 'finals'

function computeDefaultRound(byRound: BracketMatch[][], roundsCount: number): RoundSelection {
  for (let r = 1; r <= roundsCount; r++) {
    if (byRound[r - 1]?.some(m => m.status === 'active')) {
      return r < roundsCount ? r : 'finals'
    }
  }
  return 1 // nothing active yet (e.g. tournament hasn't started) — default to the first round
}

export default function BracketPage({ matches, teamCount, schedules }: Props) {
  const [division, setDivision] = useState<Division>('standards')
  const [view, setView]         = useState<BracketView>('all')
  // Full-screen lives in the shared app context (not local state) so it can
  // also drive the bottom nav / admin side-panel out of the way. Reset it on
  // unmount so leaving the page can never leave the flag stuck on.
  const { bracketFullscreen: fullscreen, setBracketFullscreen: setFullscreen } = useAdminPanels()
  useEffect(() => () => setFullscreen(false), [setFullscreen])
  // Each side-filter remembers its own round selection independently —
  // switching filters never carries a pick over from another filter.
  // Unset (no entry yet) falls back to the computed "earliest active round".
  const [roundOverride, setRoundOverride] = useState<Partial<Record<BracketView, RoundSelection>>>({})
  // One shared id-keyed registry for every match card on screen — round
  // jumps look up a round's topmost match id, team-filter jumps look up an
  // arbitrary match's id.
  const matchRefs  = useRef<Record<string, HTMLDivElement | null>>({})
  const finalsRef   = useRef<HTMLDivElement | null>(null)
  const zoomPanRef  = useRef<BracketZoomPanHandle>(null)

  // Not state — set from useTeamFilter's onAdd below, and only ever read
  // from the effect further down (keyed on teamFilters) that runs right
  // after that commit.
  const pendingFocusRef = useRef<string | null>(null)

  const wbRounds = wbRoundsFor(teamCount)
  const lbRounds = lbRoundsFor(teamCount)

  const schedule = schedules[division]
  // Re-derive active/next/todo from the schedule so at most one match per ring
  // is active (and one next) — the public bracket shows the same ring-capped
  // statuses as the admin view, not whatever raw status happens to be stored.
  const divMatches = useMemo(
    () => applyScheduleStatus(matches, schedule, division).filter(m => m.division === division),
    [matches, schedule, division],
  )
  const timeByMatchId = useMemo(
    () => new Map(schedule.rings.flat().map(e => [e.matchId, e.startMinute])),
    [schedule],
  )
  // Feeder placeholders for empty slots ("Winner of R64 M3", etc).
  const slotDefaults = useMemo(() => computeSlotDefaults(matches, division, teamCount), [matches, division, teamCount])
  const wbByRound = Array.from({ length: wbRounds }, (_, i) =>
    divMatches.filter(m => m.side === 'winners' && m.round === i + 1).sort((a, b) => a.matchNumber - b.matchNumber))
  const lbByRound = Array.from({ length: lbRounds }, (_, i) =>
    divMatches.filter(m => m.side === 'losers' && m.round === i + 1).sort((a, b) => a.matchNumber - b.matchNumber))
  const finalsSemis = divMatches.filter(m => m.side === 'finals-semi').sort((a, b) => a.matchNumber - b.matchNumber)
  const finalsFinal = divMatches.find(m => m.side === 'finals-final')
  const finalsThird = divMatches.find(m => m.side === 'finals-third')

  const finalWinner = finalsFinal ? winner(finalsFinal) : null
  const first  = finalsFinal && finalWinner === 'a' ? finalsFinal.slotA.teamName : finalsFinal && finalWinner === 'b' ? finalsFinal.slotB.teamName : null
  const second = finalsFinal && finalWinner === 'a' ? finalsFinal.slotB.teamName : finalsFinal && finalWinner === 'b' ? finalsFinal.slotA.teamName : null
  const thirdWinner = finalsThird ? winner(finalsThird) : null
  const third  = finalsThird && thirdWinner === 'a' ? finalsThird.slotA.teamName : finalsThird && thirdWinner === 'b' ? finalsThird.slotB.teamName : null

  // Team filter — teams typed/picked here dim every non-matching match card
  // and jump the camera to whichever team was most recently added.
  const {
    teamFilters, teamInput, setTeamInput, showSuggestions, setShowSuggestions,
    teamSuggestions, filterSet, addTeamFilter, removeTeamFilter,
  } = useTeamFilter(divMatches, resolved => {
    const target = findTeamTargetMatch(divMatches, resolved)
    pendingFocusRef.current = target?.id ?? null
    // Switching to "All" guarantees the target match (which could be in
    // either bracket side, or Finals) is actually mounted to jump to.
    setView('all')
  })

  function isDimmed(m: BracketMatch): boolean {
    return isMatchDimmed(m, filterSet)
  }

  function isSelected(m: BracketMatch): boolean {
    return isMatchSelected(m, filterSet)
  }

  function timeFor(matchId: string): string | undefined {
    const minute = timeByMatchId.get(matchId)
    return minute === undefined ? undefined : formatTime(minute)
  }

  function registerMatchRef(id: string, el: HTMLDivElement | null) { matchRefs.current[id] = el }

  // Runs after the (possibly view-switching) state update above has
  // committed, so the target match's ref is guaranteed to be attached —
  // refs attach synchronously during commit, before any effect runs.
  useEffect(() => {
    const id = pendingFocusRef.current
    if (!id) return
    pendingFocusRef.current = null
    const el = matchRefs.current[id]
    if (el) zoomPanRef.current?.focusOnMatch(el)
  }, [teamFilters])

  const showBothSides = view === 'all' || view === 'knockouts'
  const showMain   = view !== 'finals'
  const showFinals = view === 'all' || view === 'finals'

  const h_wb = sectionH(teamCount / 2)
  const h_lb = sectionH(teamCount / 4)
  const NATURAL_H = view === 'winners' ? h_wb
                  : view === 'losers'  ? h_lb
                  : view === 'finals'  ? sectionH(2)
                  : h_wb + SIDE_GAP + h_lb

  // Round-of-N buttons — Winners Bracket ones read as "teams remaining"
  // (R64, R32, ... R4); Losers Bracket ones use the existing LB round
  // labels (LB R1, LB R2, ... LB Semis) since LB doesn't have a clean
  // "teams remaining" framing. Each side's own terminal round (WB Final /
  // LB Final) doesn't get its own button — it's bundled into "Finals",
  // which always lands on the same Finals Day gold box either way.
  const wbRoundOptions = Array.from({ length: Math.max(0, wbRounds - 1) }, (_, i) => ({
    round: i + 1,
    label: `R${teamCount / Math.pow(2, i)}`,
  }))
  const lbRoundOptions = Array.from({ length: Math.max(0, lbRounds - 1) }, (_, i) => ({
    round: i + 1,
    label: lbRoundLabel(i + 1, lbRounds),
  }))
  const roundOptionsFor = view === 'losers' ? lbRoundOptions : wbRoundOptions

  const wbDefaultRound = computeDefaultRound(wbByRound, wbRounds)
  const lbDefaultRound = computeDefaultRound(lbByRound, lbRounds)

  function currentRoundFor(v: BracketView): RoundSelection {
    if (v === 'losers') return roundOverride.losers ?? lbDefaultRound
    return roundOverride[v] ?? wbDefaultRound
  }

  function renderFinalsDay(height: number) {
    return (
    <div ref={finalsRef} style={{
      display: 'flex', alignItems: 'stretch', flexShrink: 0, borderRadius: 16,
      padding: '10px 16px 10px 8px', gap: 16,
      background: 'linear-gradient(135deg, rgba(255,215,0,0.16), rgba(255,215,0,0.04), transparent)',
      border: '1px solid rgba(255,215,0,0.3)',
      boxShadow: '0 0 40px rgba(255,215,0,0.08)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '2px 4px 6px' }}>
          <span style={{ fontSize: '0.55rem', fontWeight: 900, letterSpacing: 3, color: 'rgba(255,215,0,0.8)', textTransform: 'uppercase' }}>
            Finals Day
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ width: ROUND_W, height, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flexShrink: 0 }}>
            {finalsSemis.map(m => (
              <div key={m.id} ref={el => registerMatchRef(m.id, el)}>
                <MatchCard match={m} time={timeFor(m.id)} dimmed={isDimmed(m)} selected={isSelected(m)} defaults={slotDefaults.get(m.id)} />
              </div>
            ))}
          </div>

          {finalsSemis.length >= 2 ? (
            <ConnectorSVG fromMatches={finalsSemis} height={height} />
          ) : (
            <div style={{ width: CONN_W, flexShrink: 0 }} />
          )}

          <div style={{ width: ROUND_W, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, alignSelf: 'center', flexShrink: 0 }}>
            {finalsFinal && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ textAlign: 'center', fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2, color: 'rgba(255,215,0,0.75)', textTransform: 'uppercase' }}>
                  Grand Final
                </span>
                <div ref={el => registerMatchRef(finalsFinal.id, el)}>
                  <MatchCard match={finalsFinal} time={timeFor(finalsFinal.id)} dimmed={isDimmed(finalsFinal)} selected={isSelected(finalsFinal)} defaults={slotDefaults.get(finalsFinal.id)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Podium — gold transparent, gets exciting once places are decided */}
      <div style={{ width: PODIUM_W, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: '0.55rem', fontWeight: 900, letterSpacing: 3, color: 'rgba(255,215,0,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>
          Podium
        </span>
        {[
          { medal: '🥇', name: first,  bg: 'rgba(255,215,0,0.22)',  color: '#FFD700' },
          { medal: '🥈', name: second, bg: 'rgba(200,200,200,0.16)', color: '#e5e5e5' },
        ].map(p => (
          <div key={p.medal} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 10,
            background: p.name ? p.bg : 'rgba(255,255,255,0.03)',
          }}>
            <span style={{ fontSize: '1.1rem' }}>{p.medal}</span>
            <span style={{
              fontSize: '0.65rem', fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase',
              color: p.name ? p.color : 'rgba(255,255,255,0.25)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.name ?? 'TBD'}
            </span>
          </div>
        ))}
      </div>
    </div>
    )
  }

  // Winners tinted cool/blue, Losers tinted warm/red — an obvious color and
  // spacing difference between the two when they're shown stacked together
  // (All / Knockouts), on top of the "Winners Bracket" / "Losers Bracket"
  // labels themselves.
  function renderSideBox(side: 'winners' | 'losers', height: number) {
    const isWinners = side === 'winners'
    return (
      <div style={{
        display: 'flex', flexShrink: 0, borderRadius: 16, padding: '10px 8px',
        background: isWinners
          ? 'linear-gradient(135deg, rgba(90,160,255,0.12), transparent)'
          : 'linear-gradient(135deg, rgba(255,90,70,0.12), transparent)',
        border: `1px solid ${isWinners ? 'rgba(120,180,255,0.28)' : 'rgba(255,120,100,0.28)'}`,
      }}>
        <div style={{ height, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '2px 4px 6px' }}>
            <span style={{
              fontSize: '0.55rem', fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase',
              color: isWinners ? 'rgba(150,195,255,0.9)' : 'rgba(255,160,140,0.9)',
            }}>
              {isWinners ? 'Winners Bracket' : 'Losers Bracket'}
            </span>
          </div>
          <BracketStrip
            rounds={Array.from({ length: isWinners ? wbRounds : lbRounds }, (_, i) => i + 1)}
            matchesByRound={isWinners ? wbByRound : lbByRound}
            height={height}
            registerRef={registerMatchRef}
            filterSet={filterSet}
            times={timeByMatchId}
            slotDefaults={slotDefaults}
          />
        </div>
      </div>
    )
  }

  // Bracket content is always the full merged view (respecting the
  // All/Winners/Losers/Knockouts/Finals side-filter) — the round-of-N filter
  // below doesn't switch what's rendered, it just moves the camera (see
  // getFocusElement / BracketZoomPan), so the user can freely scroll/pan
  // away from a jumped-to round exactly like normal.
  const bracketContent = (
    <div style={{ display: 'flex', alignItems: 'stretch', padding: '12px 24px 24px' }}>
      {showMain && (
        showBothSides ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SIDE_GAP, flexShrink: 0 }}>
            {renderSideBox('winners', h_wb)}
            {renderSideBox('losers', h_lb)}
          </div>
        ) : (
          renderSideBox(view === 'losers' ? 'losers' : 'winners', NATURAL_H)
        )
      )}

      {showFinals && (
        <>
          {showMain && (
            <div style={{ width: CONN_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ height: '100%', borderLeft: '2px dashed rgba(255,215,0,0.4)' }} />
            </div>
          )}
          {renderFinalsDay(NATURAL_H)}
        </>
      )}
    </div>
  )

  function getFocusElement(): FocusTarget | null {
    if (view === 'finals') return finalsRef.current ? { anchorEl: finalsRef.current } : null
    const sel = currentRoundFor(view)
    if (sel === 'finals') return finalsRef.current ? { anchorEl: finalsRef.current } : null
    const isLosers = view === 'losers'
    const firstOfRound = (isLosers ? lbByRound : wbByRound)[sel - 1]?.[0]
    const anchorEl = firstOfRound ? matchRefs.current[firstOfRound.id] : null
    if (!anchorEl) return null
    return { anchorEl, extraWidth: PEEK_WIDTH }
  }

  function selectRound(target: RoundSelection) {
    setRoundOverride(prev => ({ ...prev, [view]: target }))
  }

  const activeRound = view === 'finals' ? 'finals' : currentRoundFor(view)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      minHeight: fullscreen ? undefined : '100dvh',
      paddingBottom: fullscreen ? 0 : 88,
      // Full-screen is transparent like the normal view, so the app's shader
      // background shows through (the bottom nav is hidden separately, so
      // nothing else bleeds in).
      ...(fullscreen ? { position: 'fixed' as const, inset: 0, zIndex: 60 } : {}),
    }}>
      {/* Page header — hidden entirely in full-screen (which shows only the
          bracket + an exit button). position+zIndex is deliberate:
          backdropFilter below creates its own stacking context, which
          otherwise traps the team filter's dropdown (position: absolute,
          overflows past this box) behind the canvas sibling underneath, since
          that sibling comes later in DOM order. This keeps the whole header
          (dropdown and all) painted — and clickable — above the canvas. */}
      {!fullscreen && (
      <div style={{
        flexShrink: 0, position: 'relative', zIndex: 5,
        padding: '28px 16px 8px',
        background: 'rgba(4,2,12,0.7)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,107,0,0.12)',
      }}>
        <div style={{ fontSize: '0.42rem', letterSpacing: 8, fontWeight: 900, color: 'rgba(255,107,0,0.5)', textTransform: 'uppercase', marginBottom: 6 }}>
          ◆ PICKABOTS 2026 ◆
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: 4, color: '#FF6B00', textTransform: 'uppercase', textShadow: '0 0 24px rgba(255,107,0,0.5), 0 0 48px rgba(255,60,0,0.2)' }}>
          BRACKET
        </div>

        {/* Division toggle on the left; Full Screen + Reset on the right,
            all on one line. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['standards', 'open'] as Division[]).map(d => (
              <button key={d} onClick={() => setDivision(d)} style={pillStyle(division === d)}>
                {d === 'standards' ? 'Standard' : 'Open'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button onClick={() => setFullscreen(true)} style={pillStyle(false)}>
              ⛶ Full Screen
            </button>
            <button onClick={() => zoomPanRef.current?.resetView()} style={pillStyle(false)}>
              ⟲ Reset
            </button>
          </div>
        </div>

        {/* All / Winners / Losers / Knockouts / Finals filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 2, borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', marginTop: 8, width: 'fit-content' }}>
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setView(f.value)}
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: '0.5rem', fontWeight: 900,
                letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                background: view === f.value ? 'rgba(255,107,0,0.25)' : 'transparent',
                color: view === f.value ? '#FF6B00' : 'rgba(255,255,255,0.4)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Round-of-N filter — jump straight to one round of whichever side
            is currently shown. Independent per side-filter: Winners/All/
            Knockouts share Winners-Bracket round labels, Losers gets its
            own Losers-Bracket round labels. Not shown for the "Finals"
            side-filter, which already isolates to a single view. Finals
            itself isn't repeated here — it already lives in the main
            filter above; picking it there is enough. */}
        {view !== 'finals' && roundOptionsFor.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {roundOptionsFor.map(r => (
              <button
                key={r.round}
                onClick={() => selectRound(r.round)}
                style={{
                  padding: '3px 9px', borderRadius: 999, fontSize: '0.48rem', fontWeight: 900,
                  letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
                  border: `1px solid ${activeRound === r.round ? 'rgba(255,107,0,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  background: activeRound === r.round ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.03)',
                  color: activeRound === r.round ? '#FF6B00' : 'rgba(255,255,255,0.4)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Team filter */}
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
      )}

      {/* Bracket canvas — pinch/pan/zoom scoped to just this area */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <BracketZoomPan ref={zoomPanRef} key={`${division}-${view}-${activeRound}`} getFocusElement={getFocusElement}>
          {bracketContent}
        </BracketZoomPan>

        {fullscreen && (
          <button
            onClick={() => setFullscreen(false)}
            aria-label="Exit full screen"
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 20,
              width: 36, height: 36, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(4,2,12,0.85)', border: '1px solid rgba(255,107,0,0.4)',
              color: '#FF6B00', fontSize: '1rem', fontWeight: 900,
              backdropFilter: 'blur(8px)', cursor: 'pointer',
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
