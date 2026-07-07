'use client'

// ── Layout constants ──────────────────────────────────────────────────────────
const MW  = 154  // match card width
const MH  = 86   // match card height (2 × 43px slots)
const CG  = 42   // column gap (connector space)
const PG  = 12   // intra-pair gap
const GG  = 26   // inter-pair gap

// R1 Y tops
const QF1_Y = 0
const QF2_Y = QF1_Y + MH + PG       // 98
const QF3_Y = QF2_Y + MH + GG       // 210
const QF4_Y = QF3_Y + MH + PG       // 308

// R1 centers
const QF1_CY = QF1_Y + MH / 2       // 43
const QF2_CY = QF2_Y + MH / 2       // 141
const QF3_CY = QF3_Y + MH / 2       // 253
const QF4_CY = QF4_Y + MH / 2       // 351

// R2 positions
const SF1_CY = (QF1_CY + QF2_CY) / 2   // 92
const SF2_CY = (QF3_CY + QF4_CY) / 2   // 302
const SF1_Y  = SF1_CY - MH / 2          // 49
const SF2_Y  = SF2_CY - MH / 2          // 259

// R3 position
const F_CY = (SF1_CY + SF2_CY) / 2      // 197
const F_Y  = F_CY - MH / 2              // 154

// Column X positions
const R1_X = 0
const R2_X = MW + CG              // 196
const R3_X = R2_X + MW + CG      // 392

// Connector node X (midpoint of each gap)
const N1_X = MW + CG / 2          // 175
const N2_X = R2_X + MW + CG / 2  // 367

const TOTAL_W = R3_X + MW         // 546  — scrolls on 480px phone
const TOTAL_H = QF4_Y + MH        // 394

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='1'/%3E%3C/svg%3E")`

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = 'complete' | 'live' | 'upcoming'
interface BracketBot  { name: string; color: string; seed: number }
interface BracketMatch {
  top:    BracketBot | null
  bottom: BracketBot | null
  winner: 'top' | 'bottom' | null
  status: Status
}

// ── Dummy data ────────────────────────────────────────────────────────────────
const WW: BracketBot = { name: 'Wedge Warrior', color: '#FF6B00', seed: 1 }
const SD: BracketBot = { name: 'Spin Doctor',   color: '#00E5FF', seed: 4 }
const FM: BracketBot = { name: 'Full Metal',    color: '#4CAF50', seed: 2 }
const FK: BracketBot = { name: 'Flip King',     color: '#FF1493', seed: 3 }
const DR: BracketBot = { name: 'Drum Roll',     color: '#FFD700', seed: 5 }
const LO: BracketBot = { name: 'Lift Off',      color: '#7B68EE', seed: 8 }
const WE: BracketBot = { name: 'Wedge Edge',    color: '#FF4500', seed: 6 }
const OX: BracketBot = { name: 'OMEGA-X',       color: '#9B30FF', seed: 7 }

const QF: BracketMatch[] = [
  { top: WW, bottom: DR, winner: 'top',  status: 'complete' },
  { top: SD, bottom: LO, winner: 'top',  status: 'complete' },
  { top: FM, bottom: FK, winner: null,   status: 'live'     },
  { top: WE, bottom: OX, winner: null,   status: 'upcoming' },
]
const SF: BracketMatch[] = [
  { top: WW, bottom: SD,   winner: null, status: 'upcoming' },
  { top: null, bottom: null, winner: null, status: 'upcoming' },
]
const FINAL: BracketMatch = { top: null, bottom: null, winner: null, status: 'upcoming' }

// ── Sub-components ────────────────────────────────────────────────────────────
function BotSlot({ bot, winner }: { bot: BracketBot | null; winner: boolean }) {
  const slotH = MH / 2
  return (
    <div style={{
      height: slotH,
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 8,
      background: winner ? 'rgba(255,107,0,0.13)' : 'transparent',
    }}>
      <div style={{
        width: 3, height: 22, borderRadius: 99, flexShrink: 0,
        background: bot ? bot.color : 'rgba(255,255,255,0.08)',
        boxShadow: winner && bot ? `0 0 10px ${bot.color}99` : 'none',
      }}/>

      {bot ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.62rem', fontWeight: 900, letterSpacing: 1,
            color: winner ? '#fff' : 'rgba(210,210,210,0.85)',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: winner && bot ? `0 0 12px ${bot.color}88` : 'none',
          }}>
            {bot.name}
          </div>
          <div style={{
            fontSize: '0.38rem', color: 'rgba(255,255,255,0.25)',
            letterSpacing: 3, fontWeight: 900, marginTop: 1,
          }}>
            SEED {bot.seed}
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: '0.52rem', color: 'rgba(255,255,255,0.2)',
          fontWeight: 900, letterSpacing: 3,
        }}>
          TBD
        </div>
      )}

      {winner && (
        <div style={{ fontSize: '0.6rem', flexShrink: 0 }}>✦</div>
      )}
    </div>
  )
}

function MatchCard({ match, x, y }: { match: BracketMatch; x: number; y: number }) {
  const isLive     = match.status === 'live'
  const isComplete = match.status === 'complete'

  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      width: MW, height: MH,
      background: 'rgba(6,3,16,0.88)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${
        isLive     ? 'rgba(255,107,0,0.6)' :
        isComplete ? 'rgba(255,255,255,0.14)' :
                     'rgba(255,255,255,0.07)'
      }`,
      borderRadius: 10, overflow: 'hidden',
      boxShadow: isLive
        ? '0 0 24px rgba(255,107,0,0.22), inset 0 0 30px rgba(255,107,0,0.04)'
        : '0 4px 20px rgba(0,0,0,0.6)',
    }}>
      {/* Grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: GRAIN, backgroundSize: '140px 140px', opacity: 0.05,
      }}/>

      <BotSlot bot={match.top}    winner={match.winner === 'top'}    />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', position: 'relative', zIndex: 1 }}/>
      <BotSlot bot={match.bottom} winner={match.winner === 'bottom'} />

      {/* Status badge */}
      <div style={{
        position: 'absolute', top: 4, right: 6,
        fontSize: '0.35rem', fontWeight: 900, letterSpacing: 2,
        color: isLive ? '#FF6B00' : isComplete ? 'rgba(76,255,0,0.6)' : 'rgba(255,255,255,0.2)',
        animation: isLive ? 'livePulse 1s ease infinite alternate' : 'none',
      }}>
        {isLive ? '● LIVE' : isComplete ? '✓ DONE' : '· · ·'}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BracketPage() {
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
          ◆ SEASON 1 ◆
        </div>
        <div style={{
          fontSize: '1.6rem', fontWeight: 900, letterSpacing: 4,
          color: '#FF6B00', textTransform: 'uppercase',
          textShadow: '0 0 24px rgba(255,107,0,0.5), 0 0 48px rgba(255,60,0,0.2)',
        }}>
          BRACKET
        </div>
        <div style={{
          fontSize: '0.5rem', letterSpacing: 4, color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase', marginTop: 4, fontWeight: 900,
        }}>
          Single elimination · 8 competitors
        </div>
      </div>

      {/* Scroll hint */}
      <div style={{
        padding: '10px 16px 0',
        fontSize: '0.4rem', letterSpacing: 3, fontWeight: 900,
        color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase',
        textAlign: 'right',
      }}>
        scroll → to see full bracket
      </div>

      {/* Horizontally scrolling bracket */}
      <div style={{
        overflowX: 'auto', overflowY: 'visible',
        padding: '36px 20px 28px',
        scrollbarWidth: 'none',
      }}>
        <div style={{
          position: 'relative',
          width: TOTAL_W,
          height: TOTAL_H + 36,
        }}>
          {/* Round labels */}
          {([
            { x: R1_X, label: 'QUARTER FINALS' },
            { x: R2_X, label: 'SEMI FINALS'    },
            { x: R3_X, label: 'FINAL'          },
          ] as const).map(({ x, label }) => (
            <div key={label} style={{
              position: 'absolute', top: 0, left: x, width: MW,
              textAlign: 'center',
              background: 'rgba(4,2,12,0.7)',
              backdropFilter: 'blur(8px)',
              borderRadius: 6, padding: '4px 0',
              fontSize: '0.38rem', fontWeight: 900, letterSpacing: 4,
              color: 'rgba(255,107,0,0.55)', textTransform: 'uppercase',
            }}>
              {label}
            </div>
          ))}

          {/* Match cards — offset below labels */}
          <div style={{ position: 'absolute', top: 30, left: 0, width: '100%', height: '100%' }}>
            {/* SVG connector lines */}
            <svg
              width={TOTAL_W} height={TOTAL_H}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
            >
              <g stroke="rgba(255,107,0,0.2)" strokeWidth="1.5" fill="none" strokeLinecap="round">
                <path d={`M${MW} ${QF1_CY} H${N1_X} V${QF2_CY} H${MW}`}/>
                <line x1={N1_X} y1={SF1_CY} x2={R2_X} y2={SF1_CY}/>
                <path d={`M${MW} ${QF3_CY} H${N1_X} V${QF4_CY} H${MW}`}/>
                <line x1={N1_X} y1={SF2_CY} x2={R2_X} y2={SF2_CY}/>
                <path d={`M${R2_X + MW} ${SF1_CY} H${N2_X} V${SF2_CY} H${R2_X + MW}`}/>
                <line x1={N2_X} y1={F_CY} x2={R3_X} y2={F_CY}/>
              </g>
            </svg>

            {/* Quarter Finals */}
            <MatchCard match={QF[0]} x={R1_X} y={QF1_Y} />
            <MatchCard match={QF[1]} x={R1_X} y={QF2_Y} />
            <MatchCard match={QF[2]} x={R1_X} y={QF3_Y} />
            <MatchCard match={QF[3]} x={R1_X} y={QF4_Y} />
            {/* Semi Finals */}
            <MatchCard match={SF[0]} x={R2_X} y={SF1_Y} />
            <MatchCard match={SF[1]} x={R2_X} y={SF2_Y} />
            {/* Final */}
            <MatchCard match={FINAL} x={R3_X} y={F_Y} />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 20, justifyContent: 'center',
        padding: '4px 16px 20px',
      }}>
        {[
          { color: 'rgba(76,255,0,0.7)',    label: 'Complete' },
          { color: '#FF6B00',               label: 'Live'     },
          { color: 'rgba(255,255,255,0.2)', label: 'Upcoming' },
        ].map(({ color, label }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(4,2,12,0.65)',
            backdropFilter: 'blur(8px)',
            padding: '5px 10px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }}/>
            <span style={{
              fontSize: '0.42rem', fontWeight: 900, letterSpacing: 2,
              color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
            }}>{label}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes livePulse { from { opacity: 0.5; } to { opacity: 1; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
