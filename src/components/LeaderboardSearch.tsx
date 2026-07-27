'use client'
import RamCoin from './RamCoin'

const MEDAL = ['🥇', '🥈', '🥉']

/** The bits of a leaderboard row this bar needs to render a suggestion. */
export type SearchRow = { id: string; name: string; rank: number; coins: number }

type Props = {
  placeholder: string
  noun: string            // 'player' / 'team', for the summary line
  query: string
  onQueryChange: (v: string) => void
  showSuggestions: boolean
  setShowSuggestions: (v: boolean) => void
  suggestions: SearchRow[]
  pickedRows: SearchRow[]
  onPick: (id: string) => void
  onUnpick: (id: string) => void
  onClearAll: () => void
  visibleCount: number
  totalCount: number
}

/**
 * Search-and-pick bar shared by both leaderboard boards: type to get a
 * dropdown, click a row to add it as a chip, chips narrow the board. Same
 * interaction as the match list's TeamFilterBar, styled for this page.
 *
 * position+zIndex raise the whole block, not just the dropdown: backdropFilter
 * makes this a stacking context, so the suggestion list's own zIndex can't
 * escape it, and the column headers and rows below (each its own stacking
 * context, same reason) would otherwise paint over it in DOM order. 90 also
 * clears the fixed BottomNav (z-50), which a long list can reach on a short
 * viewport, while staying under the sticky Header (100) and the modals (200).
 */
export default function LeaderboardSearch({
  placeholder, noun, query, onQueryChange, showSuggestions, setShowSuggestions,
  suggestions, pickedRows, onPick, onUnpick, onClearAll, visibleCount, totalCount,
}: Props) {
  const q = query.trim()

  return (
    <div style={{
      position: 'relative', zIndex: 90,
      padding: '12px 16px',
      background: 'rgba(4,2,12,0.55)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 12, fontSize: '0.8rem', opacity: 0.4, pointerEvents: 'none' }}>🔍</span>
        <input
          value={query}
          onChange={e => { onQueryChange(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          // Delay the close so a click on a suggestion lands before it unmounts.
          onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (suggestions.length === 1) onPick(suggestions[0].id) }
            if (e.key === 'Escape') setShowSuggestions(false)
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 34px', borderRadius: 10,
            background: 'rgba(6,3,16,0.82)',
            border: '1px solid rgba(255,107,0,0.22)',
            color: '#fff', font: 'inherit', fontSize: '0.72rem', fontWeight: 700, letterSpacing: 1,
            outline: 'none',
          }}
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            style={{
              position: 'absolute', right: 8, width: 22, height: 22, borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
              color: '#999', fontSize: '0.7rem', fontWeight: 900, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        )}

        {/* Suggestions — pick one to add it to the filter */}
        {showSuggestions && q && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 30,
            background: 'rgba(4,2,12,0.96)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,107,0,0.22)', borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}>
            {suggestions.length === 0 && (
              <div style={{
                padding: '10px 12px', fontSize: '0.5rem', fontWeight: 900, letterSpacing: 2,
                color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
              }}>
                No {noun}s found
              </div>
            )}
            {suggestions.map(r => (
              <div
                key={r.id}
                onMouseDown={() => onPick(r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <span style={{
                  width: 26, fontSize: '0.5rem', fontWeight: 900, letterSpacing: 1,
                  color: 'rgba(255,255,255,0.3)',
                }}>
                  {r.rank <= 3 ? MEDAL[r.rank - 1] : `#${r.rank}`}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: '0.6rem', fontWeight: 900, letterSpacing: 1.5,
                  color: '#fff', textTransform: 'uppercase',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.name}
                </span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: '0.55rem', fontWeight: 900, letterSpacing: 1, color: '#FFD700',
                }}>
                  <RamCoin size={11}/>{r.coins.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Picked chips */}
      {pickedRows.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
          {pickedRows.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 10px', borderRadius: 999,
              background: 'rgba(255,107,0,0.18)', border: '1px solid rgba(255,107,0,0.45)',
            }}>
              <span style={{ fontSize: '0.48rem', fontWeight: 900, color: '#FF6B00', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {r.name}
              </span>
              <button
                onClick={() => onUnpick(r.id)}
                aria-label={`Remove ${r.name}`}
                style={{
                  width: 15, height: 15, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: '0.42rem', fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0,
                }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={onClearAll}
            style={{
              padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.45)', font: 'inherit',
              fontSize: '0.44rem', fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {pickedRows.length > 0 && (
        <div style={{
          marginTop: 8, fontSize: '0.42rem', fontWeight: 900, letterSpacing: 3,
          color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
        }}>
          Showing {visibleCount} of {totalCount} {totalCount === 1 ? noun : `${noun}s`}
        </div>
      )}
    </div>
  )
}
