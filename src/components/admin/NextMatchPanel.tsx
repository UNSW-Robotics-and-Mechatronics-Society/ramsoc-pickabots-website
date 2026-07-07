"use client";

import { type BracketMatch, type Division, type TeamCount, wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel } from "@/lib/mock-data";
import { cn } from "@/lib/cn";

const STATUS_COLOR = {
  active: 'border-green-400/60 bg-green-400/8 text-green-300',
  next:   'border-yellow-400/60 bg-yellow-400/8 text-yellow-300',
} as const;

function matchLabel(m: BracketMatch, teamCount: TeamCount): string {
  if (m.side === 'finals-semi')  return `Finals Semi ${m.matchNumber}`;
  if (m.side === 'finals-third') return '3rd Place';
  if (m.side === 'finals-final') return 'Finals';
  const total = m.side === 'winners' ? wbRoundsFor(teamCount) : lbRoundsFor(teamCount);
  return m.side === 'winners'
    ? wbRoundLabel(m.round, total)
    : lbRoundLabel(m.round, total);
}

type Props = {
  matches: BracketMatch[];
  division: Division;
  teamCount: TeamCount;
};

export default function NextMatchPanel({ matches, division, teamCount }: Props) {
  const relevant = matches
    .filter(m => m.division === division && (m.status === 'active' || m.status === 'next'))
    .sort((a, b) => {
      // active before next
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      // winners before losers before finals day
      const sideOrder = { winners: 0, losers: 1, 'finals-semi': 2, 'finals-third': 3, 'finals-final': 4 };
      if (a.side !== b.side) return sideOrder[a.side] - sideOrder[b.side];
      if (a.round !== b.round) return a.round - b.round;
      return a.matchNumber - b.matchNumber;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <span className="text-[0.6rem] uppercase tracking-widest text-foreground/50">Next Up</span>
      </div>

      <div className="flex-1 overflow-auto">
        {relevant.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-foreground/30">No active or upcoming matches</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {relevant.map(m => {
              const color = STATUS_COLOR[m.status as 'active' | 'next'];
              return (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-xl border p-3 text-xs",
                    color,
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[0.6rem] uppercase tracking-wider opacity-80">
                      {matchLabel(m, teamCount)}
                      {m.side !== 'finals-semi' && m.side !== 'finals-third' && m.side !== 'finals-final' && ` · M${m.matchNumber}`}
                    </span>
                    <span className={cn(
                      "rounded px-1.5 py-0.5 text-[0.55rem] font-medium uppercase tracking-wide",
                      m.status === 'active' ? "bg-green-400/20 text-green-300" : "bg-yellow-400/20 text-yellow-300",
                    )}>
                      {m.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {[m.slotA, m.slotB].map((slot, si) => (
                      <div key={si} className="flex items-center justify-between rounded bg-white/5 px-2 py-1">
                        <span className="truncate text-foreground/80">
                          {slot.teamName || <span className="italic text-foreground/30">TBD</span>}
                        </span>
                        <span className="ml-2 shrink-0 tabular-nums text-foreground/60">{slot.score}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-1.5 text-right text-[0.5rem] text-foreground/30">
                    Win at {m.targetScore}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
