'use client'

type Props = {
  teamInput: string
  onInputChange: (v: string) => void
  showSuggestions: boolean
  setShowSuggestions: (v: boolean) => void
  teamSuggestions: string[]
  teamFilters: string[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}

/**
 * Type/pick a team to dim every other match on the page — the inline-style
 * counterpart to admin/TeamFilterBar's Tailwind version, sharing the same
 * useTeamFilter hook (lib/teamFilter) and prop shape, styled to match the
 * public bracket/match-list pages instead of the admin panels.
 */
export default function TeamFilterBar({
  teamInput, onInputChange, showSuggestions, setShowSuggestions,
  teamSuggestions, teamFilters, onAdd, onRemove,
}: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative' }}>
        <input
          value={teamInput}
          onChange={e => { onInputChange(e.target.value); setShowSuggestions(true) }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onAdd(teamInput) }
            if (e.key === 'Escape') setShowSuggestions(false)
          }}
          placeholder="🔎 Filter by team…"
          style={{
            padding: '5px 12px', borderRadius: 999, fontSize: '0.5rem', fontWeight: 900,
            letterSpacing: 0.5, border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.04)', color: '#fff', outline: 'none', width: 170,
          }}
        />
        {showSuggestions && teamSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30,
            background: 'rgba(4,2,12,0.96)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 8, overflow: 'hidden', minWidth: 170,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            {teamSuggestions.map(name => (
              <div
                key={name}
                onMouseDown={() => onAdd(name)}
                style={{
                  padding: '6px 12px', fontSize: '0.5rem', fontWeight: 700, color: '#fff',
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5,
                }}
              >
                {name}
              </div>
            ))}
          </div>
        )}
      </div>

      {teamFilters.map(name => (
        <div key={name} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 10px', borderRadius: 999,
          background: 'rgba(255,107,0,0.18)', border: '1px solid rgba(255,107,0,0.45)',
        }}>
          <span style={{ fontSize: '0.48rem', fontWeight: 900, color: '#FF6B00', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {name}
          </span>
          <button
            onClick={() => onRemove(name)}
            aria-label={`Remove ${name} filter`}
            style={{
              width: 15, height: 15, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.14)', color: '#fff', fontSize: '0.42rem', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
