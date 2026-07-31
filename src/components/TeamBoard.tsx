'use client'
import { Fragment, useState } from 'react'
import RamCoin from './RamCoin'
import TeamLedgerModal, { type TeamLedgerTarget } from './TeamLedgerModal'
import LeaderboardSearch from './LeaderboardSearch'
import { usePickFilter } from '@/lib/pickFilter'
import type { TeamLeaderboardEntry, TeamStatusKind } from '@/lib/types'

const MEDAL = ['🥇', '🥈', '🥉']

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

const STATUS_STYLE: Record<TeamStatusKind, { color: string; bg: string }> = {
  champion:      { color: '#FFD700',              bg: 'rgba(255,215,0,0.14)' },
  'runner-up':   { color: '#C9D4E3',              bg: 'rgba(201,212,227,0.12)' },
  winners:       { color: '#4ADE80',              bg: 'rgba(76,222,128,0.12)' },
  losers:        { color: '#FFB020',              bg: 'rgba(255,176,32,0.12)' },
  'knocked-out': { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)' },
  wildcard:      { color: '#D8B4FE',              bg: 'rgba(216,180,254,0.16)' },
  special:       { color: '#C08BFF',              bg: 'rgba(155,48,255,0.14)' },
  unentered:     { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.04)' },
}

// Light purple marks a wildcard team everywhere it appears — the row name here,
// and the halo over its robot on the bidding screen.
const WILDCARD_PURPLE = '#D8B4FE'

// Blend an accent with transparency, or with the row plate — same helper the
// team ledger modal uses.
const tint = (color: string, pct: number, over = 'transparent') =>
  `color-mix(in srgb, ${color} ${pct}%, ${over})`

// The unlit row background, kept as a named value so a division tint can be
// mixed OVER it rather than replacing it (a bare translucent accent would drop
// the dark plate and let the page show through).
const ROW_PLATE = 'rgba(6,3,16,0.82)'

// Division accent: Open green, Standards orange — the same pair the admin
// bracket uses for its division badges. (The OBS overlays use a punchier green
// tuned for camera legibility; this one matches the app's own palette, and is
// already the green of the "Winners" status pill above.)
//
// Special/boss teams are in no bracket and so belong to no division — they get
// no accent and keep the neutral plate.
const DIVISION_ACCENT: Record<'standards' | 'open', string> = {
  standards: '#FF6B00',
  open:      '#4ADE80',
}
const DIVISION_SHORT: Record<'standards' | 'open', string> = {
  standards: 'Standards',
  open:      'Open',
}

// 'all' is the only view special/boss teams appear in — they're in no bracket,
// so they belong to neither division.
type DivisionView = 'standards' | 'open' | 'all'

const DIVISION_TABS: { key: DivisionView; label: string }[] = [
  { key: 'standards', label: 'Standards' },
  { key: 'open',      label: 'Open' },
  { key: 'all',       label: 'All' },
]

type RankedTeam = TeamLeaderboardEntry & { rank: number }

// The three bands the board is ordered into (see computeTeamsLeaderboard's
// sort). 'ranked' is the leaderboard proper; the other two are greyed tails,
// each introduced by its own divider. A team nobody has voted on sits in
// 'unvoted' whatever its bracket status — one vote is what promotes it up.
type Tier = 'ranked' | 'knocked-out' | 'unvoted'

const tierOf = (t: TeamLeaderboardEntry): Tier =>
  t.votes === 0 ? 'unvoted' : t.eliminated ? 'knocked-out' : 'ranked'

const TIER_DIVIDER: Record<Tier, string | null> = {
  ranked: null,
  'knocked-out': '◆ Knocked Out ◆',
  unvoted: '◆ No Votes Yet ◆',
}

/** Teams ranked by RamCoins bet on them; knocked-out then un-voted-on teams greyed at the bottom. */
export default function TeamBoard({ teams }: { teams: TeamLeaderboardEntry[] }) {
  const [division, setDivision] = useState<DivisionView>('all')
  const [selected, setSelected] = useState<TeamLedgerTarget | null>(null)

  // `teams` arrives already ordered (alive before knocked-out, then most→least
  // coins), so filtering preserves that and ranks are just a re-index per view.
  const inView = division === 'all'
    ? teams
    : teams.filter(t => t.kind === 'regular' && t.division === division)
  const ranked: RankedTeam[] = inView.map((t, i) => ({ ...t, rank: i + 1 }))

  const filter = usePickFilter(ranked)
  const visible = filter.visible

  function switchDivision(key: DivisionView) {
    setDivision(key)
    // Picked teams from the previous division aren't in this one — keeping them
    // would filter the board down to nothing.
    filter.clearAll()
    filter.setQuery('')
  }

  return (
    <>
      {/* Division tabs */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 16px',
        background: 'rgba(4,2,12,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        {DIVISION_TABS.map(tab => {
          const active = division === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => switchDivision(tab.key)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 999, cursor: 'pointer', font: 'inherit',
                fontSize: '0.46rem', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase',
                border: `1px solid ${active ? 'rgba(255,107,0,0.45)' : 'rgba(255,255,255,0.1)'}`,
                background: active ? 'rgba(255,107,0,0.16)' : 'rgba(255,255,255,0.03)',
                color: active ? '#FF6B00' : 'rgba(255,255,255,0.4)',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <LeaderboardSearch
        placeholder="Search teams…"
        noun="team"
        query={filter.query}
        onQueryChange={filter.setQuery}
        showSuggestions={filter.showSuggestions}
        setShowSuggestions={filter.setShowSuggestions}
        suggestions={filter.suggestions.map(t => ({ id: t.id, name: t.name, rank: t.rank, coins: t.tokens }))}
        pickedRows={filter.pickedItems.map(t => ({ id: t.id, name: t.name, rank: t.rank, coins: t.tokens }))}
        onPick={filter.pick}
        onUnpick={filter.unpick}
        onClearAll={filter.clearAll}
        visibleCount={visible.length}
        totalCount={ranked.length}
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
        <span style={{ flex: 1 }}>Team</span>
        <span style={{ width: 76, textAlign: 'right' }}>Ramcoins</span>
        <span style={{ width: 56, textAlign: 'right' }}>W / L</span>
        <span style={{ width: 46, textAlign: 'right' }}>Rate</span>
      </div>

      {/* Team rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' }}>
        {visible.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.3)',
            fontSize: '0.6rem', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase',
          }}>
            {filter.picked.length ? 'Selected teams are no longer listed' : 'No teams yet'}
          </div>
        )}
        {visible.map((t, i) => {
          const tier = tierOf(t)
          const greyed = tier !== 'ranked'
          const isTop3 = t.rank <= 3 && !greyed
          const st = STATUS_STYLE[t.status]
          // Division colour drives the row's accent stripe, tint and glow. Null
          // for special/boss teams, which fall back to the previous neutral row
          // with the orange top-3 treatment.
          const accent = t.kind === 'regular' && t.division ? DIVISION_ACCENT[t.division] : null
          // Each tail's header, shown once at the row the tier changes on — so a
          // filtered view that opens mid-tail still gets its label.
          const divider = tier !== (i > 0 ? tierOf(visible[i - 1]) : 'ranked')
            ? TIER_DIVIDER[tier]
            : null

          return (
            <Fragment key={t.id}>
              {divider && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '14px 4px 4px',
                  fontSize: '0.42rem', fontWeight: 900, letterSpacing: 3,
                  color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
                }}>
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }}/>
                  {divider}
                  <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }}/>
                </div>
              )}

              <button
                onClick={() => setSelected({ name: t.name, division: t.division ?? undefined })}
                style={{
                  position: 'relative', overflow: 'hidden',
                  display: 'flex', alignItems: 'center',
                  width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                  padding: '13px 12px',
                  // Top-3 emphasis is now expressed IN the division colour rather
                  // than always-orange — otherwise every podium row read as
                  // Standards once orange became a division signal.
                  background: accent
                    ? tint(accent, isTop3 ? 14 : 5, ROW_PLATE)
                    : isTop3 ? 'rgba(255,107,0,0.1)' : ROW_PLATE,
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: `1px solid ${accent
                    ? tint(accent, isTop3 ? 42 : 20)
                    : isTop3 ? 'rgba(255,107,0,0.28)' : 'rgba(255,255,255,0.07)'}`,
                  // Solid stripe down the leading edge — the division read at a
                  // glance while scanning the column, and the same idiom the
                  // upcoming-matches overlay uses. Set after `border` so it wins.
                  ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
                  borderRadius: 10,
                  boxShadow: accent
                    ? (isTop3 ? `0 0 20px ${tint(accent, 14)}` : '0 2px 12px rgba(0,0,0,0.5)')
                    : isTop3 ? '0 0 20px rgba(255,107,0,0.1)' : '0 2px 12px rgba(0,0,0,0.5)',
                  opacity: greyed ? 0.45 : 1,
                }}
              >
                {/* Grain */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  backgroundImage: GRAIN, backgroundSize: '140px 140px', opacity: 0.05,
                }}/>

                {/* Rank */}
                <div style={{ width: 38, fontSize: isTop3 ? '1.1rem' : '0.68rem', flexShrink: 0, position: 'relative' }}>
                  {isTop3
                    ? MEDAL[t.rank - 1]
                    : <span style={{ fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>{t.rank}</span>
                  }
                </div>

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0, position: 'relative', paddingRight: 8 }}>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 900, letterSpacing: 2,
                    color: t.status === 'wildcard'
                      ? WILDCARD_PURPLE
                      : isTop3 ? '#fff' : 'rgba(210,210,210,0.9)',
                    textTransform: 'uppercase', marginBottom: 5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 7px', borderRadius: 999,
                      fontSize: '0.4rem', fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase',
                      color: st.color, background: st.bg,
                    }}>
                      {t.statusLabel}
                    </span>
                    {/* Names the division in words as well as colour — the stripe
                        alone is invisible to a colour-blind reader, and in the
                        All tab there's otherwise nothing to tell the two apart. */}
                    {accent && t.division && (
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 999,
                        fontSize: '0.4rem', fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase',
                        color: accent, background: tint(accent, 14),
                      }}>
                        {DIVISION_SHORT[t.division]}
                      </span>
                    )}
                  </span>
                </div>

                {/* Coins bet on */}
                <div style={{
                  width: 76, textAlign: 'right',
                  fontSize: '0.7rem', fontWeight: 900, letterSpacing: 1,
                  color: '#FFD700',
                  textShadow: isTop3 ? '0 0 10px rgba(255,215,0,0.45)' : 'none',
                  position: 'relative',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <RamCoin size={13}/>{t.tokens.toLocaleString()}
                  </span>
                </div>

                {/* W/L */}
                <div style={{
                  width: 56, textAlign: 'right',
                  fontSize: '0.54rem', fontWeight: 900, letterSpacing: 1,
                  position: 'relative',
                }}>
                  <span style={{ color: 'rgba(76,255,0,0.75)' }}>{t.wins}W</span>
                  <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 1px' }}>/</span>
                  <span style={{ color: 'rgba(255,80,80,0.75)' }}>{t.losses}L</span>
                </div>

                {/* Win rate */}
                <div style={{
                  width: 46, textAlign: 'right',
                  fontSize: '0.62rem', fontWeight: 900, letterSpacing: 1,
                  color: t.winRate >= 60
                    ? 'rgba(76,255,0,0.85)'
                    : t.winRate >= 40
                    ? 'rgba(255,215,0,0.8)'
                    : 'rgba(255,80,80,0.7)',
                  position: 'relative',
                }}>
                  {t.winRate}%
                </div>
              </button>
            </Fragment>
          )
        })}
      </div>

      <TeamLedgerModal target={selected} onClose={() => setSelected(null)} />
    </>
  )
}
