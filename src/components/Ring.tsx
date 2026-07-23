'use client'
import { useState } from 'react'
import BotSvg from './BotSvg'
import type { Match, Vote, VoteStandings } from '@/lib/types'

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
  vote: Vote | null
  standings: VoteStandings | null
  /** Whether voting is currently open. When false, vote buttons are disabled and votes are locked. */
  votingOpen?: boolean
  onVote: (side: 'left' | 'right') => void
  onUndo: () => void
}

export default function Ring({ match, vote, standings, votingOpen = true, onVote, onUndo }: RingProps) {
  const meta = COMP_META[match.comp_type] ?? COMP_META.standard
  const voted = !!vote
  // Sides are non-interactive once the user has voted OR voting is closed.
  const locked = voted || !votingOpen
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

      {/* Inner row */}
      <div style={{ display: 'flex', minHeight: 140, position: 'relative', zIndex: 1 }}>
        <Side bot={{ name: match.left_name, color: match.left_color, shape: match.left_shape }}
              side="left"  isBossbot={match.is_bossbot} ringColor={meta.color}
              impactWord={lWord} disabled={locked}
              mult={standings && !standings.noData ? standings.multiplierIfLeftWins : null}
              onClick={() => !locked && onVote('left')} />
        <Side bot={{ name: match.right_name, color: match.right_color, shape: match.right_shape }}
              side="right" isBossbot={match.is_bossbot} ringColor={meta.color}
              impactWord={rWord} disabled={locked}
              mult={standings && !standings.noData ? standings.multiplierIfRightWins : null}
              onClick={() => !locked && onVote('right')} />

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
            <div style={{ fontSize: '0.48rem', fontWeight: 900, color: '#444', textTransform: 'uppercase', letterSpacing: 4 }}>VOTED</div>
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', margin: '4px 0', letterSpacing: 1 }}>
              {vote.side === 'left' ? match.left_name : match.right_name}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#FFD700', letterSpacing: 1 }}>🪙 {vote.amount}</div>
            {(() => {
              const mult = standings && !standings.noData
                ? (vote.side === 'left' ? standings.multiplierIfLeftWins : standings.multiplierIfRightWins)
                : null
              const expectedReturn = mult != null ? Math.round(vote.amount * mult) : vote.amount * 2
              return (
                <div style={{ fontSize: '0.58rem', color: '#4cff00', marginTop: 2, letterSpacing: 2 }}>
                  REWARD · {expectedReturn}
                </div>
              )
            })()}
        {votingOpen ? (
              <button onClick={onUndo} style={{
                display: 'block', margin: '10px auto 0', fontSize: '0.65rem', color: '#fff',
                background: 'rgba(26,108,255,0.7)', border: '1px solid rgba(26,108,255,0.5)',
                borderRadius: 8, padding: '6px 18px', fontWeight: 900, letterSpacing: 2, cursor: 'pointer',
              }}>Change Vote</button>
            ) : (
              <div style={{ marginTop: 8, fontSize: '0.5rem', fontWeight: 900, color: '#888', letterSpacing: 2 }}>🔒 LOCKED IN</div>
            )}
          </div>
        </div>
      )}

      {/* Voting-closed overlay — shown when voting is off and the user has NOT voted */}
      {!voted && !votingOpen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(2,0,6,0.72)', backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)', animation: 'fadeIn 0.25s ease',
        }}>
          <div style={{
            background: 'rgba(5,2,14,0.92)', border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 12, padding: '10px 20px', textAlign: 'center',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ fontSize: '1rem' }}>🔒</div>
            <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#fff', marginTop: 4, textTransform: 'uppercase', letterSpacing: 3 }}>
              Voting Closed
            </div>
          </div>
        </div>
      )}

      {/* Odds footer — zIndex 25 keeps it above the voted overlay (zIndex 20) */}
      <div style={{
        position: 'relative', zIndex: 25,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', overflow: 'hidden', height: 28,
      }}>
        {/* Blue fill */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${standings && !standings.noData ? standings.pctLeft : 50}%`,
          background: 'rgba(26,108,255,0.18)', transition: 'width 0.5s ease',
        }}/>
        {/* Red fill */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: `${standings && !standings.noData ? standings.pctRight : 50}%`,
          background: 'rgba(255,45,45,0.18)', transition: 'width 0.5s ease',
        }}/>
        {/* Left label */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          justifyContent: 'center', padding: '0 10px', position: 'relative',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: standings && !standings.noData ? '#fff' : '#2a2a2a' }}>
            {standings && !standings.noData ? `${standings.pctLeft}%` : '—'}
          </span>
        </div>
        {/* Right label */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
          justifyContent: 'center', padding: '0 10px', position: 'relative',
        }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 900, color: standings && !standings.noData ? '#fff' : '#2a2a2a' }}>
            {standings && !standings.noData ? `${standings.pctRight}%` : '—'}
          </span>
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
      {hovered && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse at 50% 55%, color-mix(in srgb, ${ringColor} 18%, transparent) 0%, transparent 65%)`,
          animation: 'nebulaPulse 1.6s ease infinite alternate',
        }}/>
      )}

      {/* Hyperspace warp rings */}
      {hovered && [0, 0.28, 0.56].map(delay => (
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
        opacity: hovered ? 1 : 0,
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
