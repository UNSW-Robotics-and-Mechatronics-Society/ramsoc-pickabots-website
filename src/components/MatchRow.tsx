"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type Bot = {
  name: string;
  /** Current crowd pick share, 0–100. Display only for now. */
  odds: number;
};

export type Match = {
  id: string;
  label: string;
  status: "live" | "starting" | "final";
  a: Bot;
  b: Bot;
};

const STATUS_STYLES: Record<Match["status"], string> = {
  live: "bg-red-500/20 text-red-300",
  starting: "bg-amber-500/20 text-amber-200",
  final: "bg-white/10 text-foreground/60",
};

const STATUS_LABEL: Record<Match["status"], string> = {
  live: "● LIVE",
  starting: "STARTING",
  final: "FINAL",
};

export default function MatchRow({ match }: { match: Match }) {
  // Local pick only — wiring to Supabase comes with the MVP.
  const [pick, setPick] = useState<"a" | "b" | null>(null);

  const Side = ({ side, bot }: { side: "a" | "b"; bot: Bot }) => {
    const picked = pick === side;
    return (
      <button
        type="button"
        onClick={() => setPick(picked ? null : side)}
        disabled={match.status === "final"}
        className={cn(
          "flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-3 text-center transition-colors disabled:opacity-50",
          picked
            ? "bg-white/90 text-black"
            : "bg-white/5 text-foreground hover:bg-white/10",
        )}
      >
        <span className="text-sm font-medium leading-tight">{bot.name}</span>
        <span
          className={cn(
            "text-[0.65rem] tabular-nums",
            picked ? "text-black/60" : "text-foreground/50",
          )}
        >
          {bot.odds}% picked
        </span>
      </button>
    );
  };

  return (
    <div className="glass flex flex-col gap-2 rounded-3xl p-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-[0.18em] text-foreground/55">
          {match.label}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.6rem] font-semibold tracking-wide",
            STATUS_STYLES[match.status],
          )}
        >
          {STATUS_LABEL[match.status]}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <Side side="a" bot={match.a} />
        <span className="flex items-center text-xs font-semibold text-foreground/40">
          VS
        </span>
        <Side side="b" bot={match.b} />
      </div>
    </div>
  );
}
