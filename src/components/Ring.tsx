'use client'
import { useState } from 'react'
import BotSvg from './BotSvg'
import type { Match, Bet, OddsData } from '@/lib/types'

const SHAPES = ['wedge', 'spinner', 'drum', 'flipper', 'lifter', 'fullbody'] as const

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickShape(matchId: string, side: 'left' | 'right'): string {
  return SHAPES[hashStr(matchId + side) % SHAPES.length]
}

const LEFT_COLOR  = '#1A6CFF'
const RIGHT_COLOR = '#FF2D2D'

export const COMP_META = {
  standard: { color: '#FF6B00', label: '⚙ STANDARD' },
  open:     { color: '#4cff00', label: '◈ OPEN'      },
  bossbot:  { color: '#9B30FF', label: '💀 BOSSBOT'   },
} as const

const IMPACT_WORDS = ['POW!', 'ZAP!', 'BOOM!', 'WHAM!', 'BAM!', 'NOVA!', 'SMASH!']
const rw = () => IMPACT_WORDS[Math.floor(Math.random() * IMPACT_WORDS.length)]

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

interface RingProps {
  match: Match
  bet: Bet | null
  odds: OddsData | null
  onVote: (side: 'left' | 'right') => void
  onUndo: () => void
}

export default function Ring({ match, bet, odds, onVote, onUndo }: RingProps) {
  const meta = COMP_META[match.comp_type] ?? COMP_META.standard
  const voted = !!bet
  // Sides are non-interactive once the user has bet OR bidding is closed.
  const locked = voted || !bettingOpen
  const [lWord] = useState(rw)
  const [rWord] = useState(rw)

  return (
    <div style={{
      position: 'relative',
      borderRadius: 14,
      overflow: 'hidden',
      border: `1px solid ${voted ? 'rgba(255,215,0,0.4)' : `color-mix(in srgb, ${meta.color} 35%, transparent)`}`,
      background: 'rgba(3,1,8,0.32)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      boxShadow: voted
        ? '0 0 28px rgba(255,215,0,0.1), inset 0 0 60px rgba(255,215,0,0.03)'
        : `0 0 28px color-mix(in srgb, ${meta.color} 12%, transparent), inset 0 0 60px rgba(0,0,0,0.15)`,
      userSelect: 'none',
    }}>
      {/* Grain overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: GRAIN,
        backgroundRepeat: 'repeat', backgroundSize: '140px 140px',
        opacity: 0.055,
      }}/>

      {/* Top nebula wash */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `radial-gradient(ellipse at 50% -10%, color-mix(in srgb, ${meta.color} 14%, transparent) 0%, transparent 58%)`,
      }}/>

      {/* Arena ring */}
      <svg
        aria-hidden
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      >
        {[70, 58].map((r, i) => (
          <circle key={i} cx={100} cy={50} r={r} fill="none"
            stroke="rgba(255,255,255,1)"
            strokeWidth={1.8} opacity={0.13 - i * 0.04} />
        ))}
      </svg>

      {/* Betting closed banner */}
      {!voted && match.status === 'closed' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15,
          background: 'rgba(255,170,0,0.08)',
          borderBottom: '1px solid rgba(255,170,0,0.18)',
          backdropFilter: 'blur(4px)',
          padding: '5px 12px',
          fontSize: '0.48rem', fontWeight: 900,
          textTransform: 'uppercase', letterSpacing: 4,
          color: '#FFB800', textAlign: 'center',
          pointerEvents: 'none',
        }}>
          BETTING CLOSED
        </div>
      )}

      {/* Inner row */}
      <div style={{ display: 'flex', minHeight: 140, position: 'relative', zIndex: 1 }}>
        <Side bot={{ name: match.left_name, color: LEFT_COLOR, shape: pickShape(match.id, 'left') }}
              side="left"  isBossbot={match.is_bossbot} ringColor={meta.color}
              impactWord={lWord} disabled={voted || match.status !== 'open'}
              mult={odds && !odds.noData ? odds.multiplierIfLeftWins : null}
              onClick={() => !voted && match.status === 'open' && onVote('left')} />
        <Side bot={{ name: match.right_name, color: match.is_bossbot ? '#9B30FF' : RIGHT_COLOR, shape: match.is_bossbot ? 'bossbot' : pickShape(match.id, 'right') }}
              side="right" isBossbot={match.is_bossbot} ringColor={meta.color}
              impactWord={rWord} disabled={voted || match.status !== 'open'}
              mult={odds && !odds.noData ? odds.multiplierIfRightWins : null}
              onClick={() => !voted && match.status === 'open' && onVote('right')} />

        {/* VS / ⚡ badge */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%,-50%)', zIndex: 10,
          width: 34, height: 34, borderRadius: '50%',
          background: match.is_bossbot ? 'rgba(155,48,255,0.75)' : 'rgba(255,107,0,0.85)',
          color: '#fff',
          fontSize: match.is_bossbot ? '1rem' : '0.72rem',
          fontWeight: 900, letterSpacing: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: match.is_bossbot
            ? '1px solid rgba(155,48,255,0.5)'
            : '1px solid rgba(255,107,0,0.4)',
          boxShadow: match.is_bossbot
            ? '0 0 18px rgba(155,48,255,0.5)'
            : '0 0 18px rgba(255,107,0,0.45)',
          backdropFilter: 'blur(6px)',
          pointerEvents: 'none',
        }}>
          {match.is_bossbot ? '⚡' : 'VS'}
        </div>
      </div>

      {/* Comp badge */}
      <div style={{
        position: 'absolute', top: 8, left: 10, zIndex: 12,
        background: `color-mix(in srgb, ${meta.color} 8%, rgba(0,0,0,0.45))`,
        border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
        backdropFilter: 'blur(8px)',
        borderRadius: 5, padding: '3px 8px',
        fontSize: '0.48rem', fontWeight: 900,
        textTransform: 'uppercase', letterSpacing: 3,
        color: meta.color, pointerEvents: 'none',
      }}>
        {meta.label}
      </div>

      {/* Voted overlay */}
      {voted && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(2,0,6,0.72)', backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.25s ease',
        }}>
          <div style={{
            background: 'rgba(5,2,14,0.92)',
            border: '1px solid rgba(255,215,0,0.35)',
            borderRadius: 12, padding: '10px 20px', textAlign: 'center',
            boxShadow: '0 0 40px rgba(255,215,0,0.1)',
            backdropFilter: 'blur(12px)',
          }}>
            {/* Header label changes based on resolution state */}
            <div style={{ fontSize: '0.48rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 4,
              color: bet.payout === null ? '#444' : bet.refunded ? '#FFD700' : bet.payout > 0 ? '#4cff00' : '#ff4444',
            }}>
              {bet.payout === null ? 'BET LOCKED' : bet.refunded ? 'REFUNDED' : bet.payout > 0 ? 'YOU WON' : 'YOU LOST'}
            </div>

            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', margin: '4px 0', letterSpacing: 1 }}>
              {bet.side === 'left' ? match.left_name : match.right_name}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#FFD700', letterSpacing: 1 }}>🪙 {bet.amount}</div>

            {/* Return line: real payout when resolved, net-profit estimate when pending */}
            {bet.payout !== null ? (
              <div style={{ fontSize: '0.58rem', fontWeight: 900, marginTop: 2, letterSpacing: 2,
                color: bet.refunded ? '#FFD700' : bet.payout > 0 ? '#4cff00' : '#ff4444',
              }}>
                {bet.refunded
                  ? `REFUNDED · ${bet.payout} 🪙`
                  : bet.payout > 0
                    ? `PAYOUT · ${bet.payout} 🪙`
                    : 'LOST · 0 🪙'}
              </div>
            ) : (
              <div style={{ fontSize: '0.58rem', marginTop: 2, letterSpacing: 2 }}>
                {(() => {
                  const mult = bet.side === 'left' ? odds?.multiplierIfLeftWins : odds?.multiplierIfRightWins
                  if (mult == null) return <span style={{ color: '#444' }}>PROFIT · TBD</span>
                  const profit = Math.round(bet.amount * mult) - bet.amount
                  if (profit === 0) return <span style={{ color: '#555' }}>NO PROFIT · no opposing bets</span>
                  return <span style={{ color: '#4cff00' }}>EST. PROFIT · +{profit} 🪙</span>
                })()}
              </div>
            )}

            {/* Undo only while betting window is open */}
            {bet.payout === null && match.status === 'open' &&
              (!match.betting_closes_at || new Date(match.betting_closes_at) > new Date()) && (
              <button onClick={onUndo} style={{
                display: 'block', marginTop: 8, fontSize: '0.52rem', color: '#444',
                background: 'none', border: 'none', textDecoration: 'underline', fontWeight: 900, letterSpacing: 2,
              }}>UNDO</button>
            )}
          </div>
        </div>
      )}

      {/* Odds footer — zIndex 25 keeps it above the voted overlay (zIndex 20) */}
      <div style={{
        position: 'relative', zIndex: 25,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        {/* Colored fill — proportional to each side's odds */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${odds && !odds.noData ? odds.pctLeft : 50}%`,
          background: 'rgba(26,108,255,0.28)',
          transition: 'width 0.6s ease',
        }} />
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: `${odds && !odds.noData ? odds.pctRight : 50}%`,
          background: 'rgba(255,45,45,0.28)',
          transition: 'width 0.6s ease',
        }} />

        {/* Left half */}
        <div style={{
          position: 'relative', zIndex: 2, flex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '4px 0',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1,
            color: odds && !odds.noData ? '#fff' : '#2a2a2a' }}>
            {odds && !odds.noData ? `${odds.pctLeft}%` : '—'}
          </span>
          {odds && !odds.noData && (
            <span style={{ fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2, marginTop: 1,
              color: 'rgba(26,108,255,0.6)' }}>
              {odds.votesLeft} {odds.votesLeft === 1 ? 'vote' : 'votes'}
            </span>
          )}
        </div>

        {/* Right half */}
        <div style={{
          position: 'relative', zIndex: 2, flex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '4px 0',
        }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: 1,
            color: odds && !odds.noData ? '#fff' : '#2a2a2a' }}>
            {odds && !odds.noData ? `${odds.pctRight}%` : '—'}
          </span>
          {odds && !odds.noData && (
            <span style={{ fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2, marginTop: 1,
              color: 'rgba(255,45,45,0.6)' }}>
              {odds.votesRight} {odds.votesRight === 1 ? 'vote' : 'votes'}
            </span>
          )}
        </div>
      </div>

      <style>{`@keyframes fadeIn { from{opacity:0} to{opacity:1} }`}</style>
    </div>
  )
}

// ── Side ─────────────────────────────────────────────────────────────────────
interface SideProps {
  bot: { name: string; color: string; shape: string }
  side: 'left' | 'right'
  isBossbot: boolean
  ringColor: string
  impactWord: string
  disabled: boolean
  mult: number | null
  onClick: () => void
}

function Side({ bot, side, isBossbot, ringColor, impactWord, disabled, mult, onClick }: SideProps) {
  const [hovered, setHovered] = useState(false)
  const isRight = side === 'right'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: '18px 10px 38px',
        position: 'relative', overflow: 'hidden',
        background: isBossbot && isRight ? 'rgba(30,0,45,0.3)' : 'transparent',
        border: 'none',
        borderRight: isRight ? 'none' : '1px solid rgba(255,255,255,0.05)',
        cursor: disabled ? 'default' : 'pointer',
        color: 'inherit',
      }}
    >
      {/* Nebula glow on hover */}
      {hovered && !disabled && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at 50% 55%, color-mix(in srgb, ${ringColor} 18%, transparent) 0%, transparent 65%)`,
          animation: 'nebulaPulse 1.6s ease infinite alternate',
        }}/>
      )}

      {/* Hyperspace warp rings */}
      {hovered && !disabled && [0, 0.28, 0.56].map(delay => (
        <div key={delay} style={{
          position: 'absolute', left: '50%', top: '44%',
          width: 58, height: 58,
          marginLeft: -29, marginTop: -29,
          borderRadius: '50%',
          border: `1.5px solid color-mix(in srgb, ${ringColor} 70%, transparent)`,
          pointerEvents: 'none',
          animation: `warpRing 0.85s ease-out ${delay}s infinite`,
        }}/>
      ))}

      {/* Impact word */}
      <span style={{
        position: 'absolute', top: 7,
        [isRight ? 'right' : 'left']: 7,
        fontSize: '0.9rem', fontWeight: 900, letterSpacing: 1,
        color: '#FF6B00',
        textShadow: '0 0 12px rgba(255,107,0,0.8), 0 0 24px rgba(255,60,0,0.4)',
        pointerEvents: 'none', zIndex: 5,
        opacity: hovered && !disabled ? 1 : 0,
        transform: hovered
          ? `scale(1) rotate(${isRight ? '8deg' : '-8deg'})`
          : `scale(0.4) rotate(${isRight ? '8deg' : '-8deg'})`,
        transition: 'all 0.14s',
        fontStyle: 'italic',
      }}>
        {impactWord}
      </span>

      {/* Robot */}
      <div style={{
        width: 64, height: 64, position: 'relative', zIndex: 2,
        transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        transform: hovered ? 'translateY(-5px) scale(1.08)' : 'none',
        filter: hovered ? `drop-shadow(0 0 8px color-mix(in srgb, ${bot.color} 70%, transparent))` : 'none',
      }}>
        <BotSvg shape={bot.shape} color={bot.color} />
      </div>

      <div style={{
        fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase',
        letterSpacing: 2, textAlign: 'center', maxWidth: 80, lineHeight: 1.2,
        color: isBossbot && isRight ? '#9B30FF' : 'rgba(220,220,220,0.9)',
        position: 'relative', zIndex: 2,
      }}>
        {bot.name}
      </div>

      {isBossbot ? (
        <div style={{
          fontSize: '0.48rem', fontWeight: 900, padding: '2px 8px', borderRadius: 4,
          textTransform: 'uppercase', letterSpacing: 3, position: 'relative', zIndex: 2,
          ...(isRight
            ? { background: 'rgba(60,0,0,0.5)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.35)' }
            : { background: 'rgba(0,40,0,0.5)', color: '#4cff00', border: '1px solid rgba(76,255,0,0.35)' }),
        }}>
          {isRight ? 'LOSES' : 'WINS'}
        </div>
      ) : (
        <div style={{
          fontSize: '0.5rem', fontWeight: 900, padding: '2px 9px',
          borderRadius: 999, textTransform: 'uppercase', letterSpacing: 3,
          position: 'relative', zIndex: 2,
          background: `color-mix(in srgb, ${ringColor} 10%, rgba(0,0,0,0.3))`,
          color: ringColor,
          border: `1px solid color-mix(in srgb, ${ringColor} 30%, transparent)`,
        }}>
          {mult != null ? `~${mult}× WIN` : '? WIN'}
        </div>
      )}

      <style>{`
        @keyframes nebulaPulse {
          from { opacity: 0.6; } to { opacity: 1; }
        }
        @keyframes warpRing {
          0%   { transform: scale(0.25); opacity: 0.8; }
          100% { transform: scale(3.2);  opacity: 0; }
        }
      `}</style>
    </button>
  )
}
