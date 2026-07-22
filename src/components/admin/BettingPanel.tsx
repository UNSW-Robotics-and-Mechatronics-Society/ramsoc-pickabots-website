"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { Match } from "@/lib/types";

export default function BettingPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const fetchMatches = useCallback(async () => {
    const res = await fetch("/api/matches");
    if (res.ok) setMatches(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMatches();
    const t = setInterval(fetchMatches, 3000);
    return () => clearInterval(t);
  }, [fetchMatches]);

  async function setStatus(id: string, status: "open" | "closed") {
    setBusy((b) => ({ ...b, [id]: true }));
    await fetch(`/api/admin/matches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetchMatches();
    setBusy((b) => ({ ...b, [id]: false }));
  }

  async function declareWinner(id: string, winner_side: "left" | "right") {
    setBusy((b) => ({ ...b, [`${id}-resolve`]: true }));
    await fetch(`/api/matches/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner_side }),
    });
    await fetchMatches();
    setBusy((b) => ({ ...b, [`${id}-resolve`]: false }));
  }

  const visible = matches.filter((m) => m.is_active || m.status !== "resolved");

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <span className="text-[0.6rem] font-bold uppercase tracking-widest text-foreground/50">
          Betting Control
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="py-8 text-center text-xs text-foreground/40">
            Loading…
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="py-8 text-center text-[0.65rem] text-foreground/40">
            No active matches in Supabase.
            <br />
            <span className="text-foreground/25">
              Set a match&apos;s is_active=true to manage it here.
            </span>
          </div>
        )}

        {visible.map((match) => (
          <div
            key={match.id}
            className="mb-3 rounded-xl border border-white/8 bg-white/[0.03] p-3"
          >
            {/* Match header */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 text-[0.6rem] font-bold uppercase tracking-wide text-foreground/80">
                <span className="text-blue-400">{match.left_name}</span>
                <span className="text-foreground/30"> vs </span>
                <span className="text-red-400">{match.right_name}</span>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-2 py-0.5 text-[0.5rem] font-bold uppercase tracking-widest",
                  match.status === "open" &&
                    "bg-green-500/20 text-green-400 ring-1 ring-green-500/30",
                  match.status === "closed" &&
                    "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30",
                  match.status === "resolved" &&
                    "bg-white/8 text-foreground/40",
                )}
              >
                {match.status}
              </span>
            </div>

            {match.status !== "resolved" && (
              <div className="flex flex-col gap-1.5">
                {/* Open / Lock toggle */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setStatus(match.id, "open")}
                    disabled={match.status === "open" || busy[match.id]}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-[0.55rem] font-bold uppercase tracking-widest transition-colors",
                      match.status === "open"
                        ? "bg-green-500/25 text-green-400 ring-1 ring-green-500/40"
                        : "bg-white/5 text-foreground/40 hover:bg-green-500/10 hover:text-green-400 disabled:opacity-50",
                    )}
                  >
                    Open Bets
                  </button>
                  <button
                    onClick={() => setStatus(match.id, "closed")}
                    disabled={match.status === "closed" || busy[match.id]}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-[0.55rem] font-bold uppercase tracking-widest transition-colors",
                      match.status === "closed"
                        ? "bg-amber-500/25 text-amber-400 ring-1 ring-amber-500/40"
                        : "bg-white/5 text-foreground/40 hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50",
                    )}
                  >
                    Lock Bets
                  </button>
                </div>

                {/* Declare winner */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => declareWinner(match.id, "left")}
                    disabled={busy[`${match.id}-resolve`]}
                    className="flex-1 rounded-lg bg-blue-500/10 py-1.5 text-[0.55rem] font-bold uppercase tracking-widest text-blue-400 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
                  >
                    {match.left_name} wins
                  </button>
                  <button
                    onClick={() => declareWinner(match.id, "right")}
                    disabled={busy[`${match.id}-resolve`]}
                    className="flex-1 rounded-lg bg-red-500/10 py-1.5 text-[0.55rem] font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {match.right_name} wins
                  </button>
                </div>
              </div>
            )}

            {match.status === "resolved" && (
              <div className="text-[0.55rem] font-bold uppercase tracking-widest text-foreground/40">
                Winner:{" "}
                <span className="text-foreground/70">
                  {match.winner_side === "left"
                    ? match.left_name
                    : match.right_name}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
