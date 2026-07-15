"use client";

// Logic lives in lib/teamFilter (no JSX, no Tailwind) so the public,
// inline-styled pages (BracketPage, MatchList) can share it too — this file
// re-exports both for existing admin imports and keeps the Tailwind-styled
// TeamFilterBar UI component below.
export { useTeamFilter, isMatchDimmed } from "@/lib/teamFilter";

type TeamFilterBarProps = {
  teamInput: string;
  onInputChange: (v: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  teamSuggestions: string[];
  teamFilters: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
};

/** Type/pick a team to dim every other match in the panel — pairs with useTeamFilter. */
export function TeamFilterBar({
  teamInput, onInputChange, showSuggestions, setShowSuggestions,
  teamSuggestions, teamFilters, onAdd, onRemove,
}: TeamFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <input
          value={teamInput}
          onChange={e => { onInputChange(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onAdd(teamInput); }
            if (e.key === 'Escape') setShowSuggestions(false);
          }}
          placeholder="🔎 Filter by team…"
          className="w-40 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[0.6rem] font-medium text-foreground outline-none placeholder:text-foreground/30 focus:border-white/35"
        />
        {showSuggestions && teamSuggestions.length > 0 && (
          <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-white/15 bg-[#040210]/95 shadow-lg">
            {teamSuggestions.map(name => (
              <div
                key={name}
                onMouseDown={() => onAdd(name)}
                className="cursor-pointer whitespace-nowrap px-2.5 py-1.5 text-[0.6rem] font-medium uppercase tracking-wide text-foreground hover:bg-white/10"
              >
                {name}
              </div>
            ))}
          </div>
        )}
      </div>

      {teamFilters.map(name => (
        <div
          key={name}
          className="flex items-center gap-1 rounded-full border border-orange-400/45 bg-orange-400/15 py-0.5 pl-2.5 pr-1"
        >
          <span className="text-[0.55rem] font-bold uppercase tracking-wide text-orange-300">{name}</span>
          <button
            onClick={() => onRemove(name)}
            aria-label={`Remove ${name} filter`}
            className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/15 text-[0.5rem] text-foreground hover:bg-white/25"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
