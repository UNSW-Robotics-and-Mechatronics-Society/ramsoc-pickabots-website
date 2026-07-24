"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, Mail, Trash2, Download, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import ConfirmDialog from "./ConfirmDialog";

type Player = {
  id: string;
  displayName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  tokens: number;
  onboarded: boolean;
  isSpectator: boolean;
  teamName: string | null;
  teamRole: "captain" | "member" | null;
  division: "standards" | "open" | null;
  extra: Record<string, unknown>;
  createdAt: string | null;
};

type PlayersResponse = { players: Player[] };
type BoostResponse = { ok: true; tokens: number } | { error: string };
type DeleteResponse = { ok: true } | { error: string };

type FilterMode = "all" | "competitors" | "spectators" | "not-onboarded";

const FILTER_OPTIONS: { label: string; value: FilterMode }[] = [
  { label: "All", value: "all" },
  { label: "Competitors", value: "competitors" },
  { label: "Spectators", value: "spectators" },
  { label: "Not onboarded", value: "not-onboarded" },
];

function displayNameOf(p: Player): string {
  return p.displayName ?? p.fullName ?? p.id;
}

/** Quote/escape a CSV field per RFC 4180 — wrap in quotes if it contains a
 *  comma, quote, or newline, doubling any embedded quotes. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(players: Player[]): string {
  const header = ["Name", "Email", "Phone", "Team", "Role", "Division", "Tokens", "Type", "Onboarded"];
  const rows = players.map(p => [
    displayNameOf(p),
    p.email ?? "",
    p.phone ?? "",
    p.teamName ?? "",
    p.teamRole ?? "",
    p.division ?? "",
    String(p.tokens),
    p.isSpectator ? "Spectator" : "Competitor",
    p.onboarded ? "Yes" : "No",
  ]);
  return [header, ...rows].map(row => row.map(csvField).join(",")).join("\r\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function PlayersPanel() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  // Held as raw text (not number) so partial entries survive a re-render —
  // notably a lone "-" while typing a negative deduction. A controlled
  // type="number" input reports its `.value` as "" mid-minus, which would
  // otherwise get coerced to 0 and wipe the "-" before the digits arrive.
  const [boostAmounts, setBoostAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId]     = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<Player | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/players");
      if (!res.ok) throw new Error(`Failed to load players (${res.status})`);
      const data = (await res.json()) as PlayersResponse;
      setPlayers(data.players);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Fetch-on-mount; load() sets loading state internally (same idiom as the
    // other admin panels in this repo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const searchLower = search.toLowerCase();
  const filtered = useMemo(() => players.filter(p => {
    if (searchLower) {
      const haystack = [
        p.displayName, p.fullName, p.email, p.phone, p.teamName,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    switch (filterMode) {
      case "competitors":    return !p.isSpectator;
      case "spectators":     return p.isSpectator;
      case "not-onboarded":  return !p.onboarded;
      default:               return true;
    }
  }), [players, searchLower, filterMode]);

  function boostTextFor(id: string): string {
    return boostAmounts[id] ?? "50";
  }

  function setBoostText(id: string, value: string) {
    setBoostAmounts(prev => ({ ...prev, [id]: value }));
  }

  /** Parsed integer for a player's boost field ("" / "-" → NaN). */
  function boostAmountFor(id: string): number {
    return Math.trunc(Number(boostTextFor(id)));
  }

  async function handleBoost(id: string) {
    const amount = boostAmountFor(id);
    // Reject blank/partial ("-") and no-op zero; negatives are valid (deduct).
    if (!Number.isFinite(amount) || amount === 0) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/players/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boost: amount }),
      });
      const data = (await res.json()) as BoostResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Boost failed (${res.status})`);
      }
      setPlayers(prev => prev.map(p => p.id === id ? { ...p, tokens: data.tokens } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Boost failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleKick(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/players/${id}`, { method: "DELETE" });
      const data = (await res.json()) as DeleteResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Kick failed (${res.status})`);
      }
      setPlayers(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kick failed");
    } finally {
      setBusyId(null);
      setKickTarget(null);
    }
  }

  function handleExport() {
    const csv = buildCsv(filtered);
    downloadCsv(csv, "pickabots-players.csv");
  }

  return (
    <div className="@container flex h-full flex-col">
      {/* search / filter / export toolbar */}
      <div className="shrink-0 space-y-1 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, team…"
            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground placeholder:text-foreground/30 outline-none focus:border-white/30"
          />
          <button
            onClick={handleExport}
            title="Export CSV"
            className="flex shrink-0 items-center gap-1 rounded border border-white/10 bg-white/8 px-2 py-1 text-[0.65rem] text-foreground/60 transition-colors hover:text-foreground/90"
          >
            <Download size={11} strokeWidth={2} />
            <span className="@max-[280px]:hidden">Export CSV</span>
          </button>
        </div>
        <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
          <span className="w-10 shrink-0 text-[0.55rem] text-foreground/50">Show</span>
          {FILTER_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setFilterMode(o.value)}
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[0.6rem] transition-colors",
                o.value === "not-onboarded" && "@max-[340px]:hidden",
                o.value === "spectators"    && "@max-[260px]:hidden",
                o.value === "competitors"   && "@max-[180px]:hidden",
                filterMode === o.value
                  ? "bg-white/20 text-foreground"
                  : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* scrollable body */}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading && (
          <p className="px-1 py-4 text-xs text-foreground/50">Loading players…</p>
        )}
        {error && !loading && (
          <div className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
            {error}
            <button onClick={load} className="ml-2 underline decoration-dotted">
              Retry
            </button>
          </div>
        )}
        {!loading && !error && (
          <h2 className="mb-2 truncate px-1 text-xs uppercase tracking-[0.18em] text-foreground/55">
            Players ({filtered.length}/{players.length})
          </h2>
        )}

        <div className="flex flex-col gap-2">
          {!loading && filtered.map(p => {
            const name       = displayNameOf(p);
            const showFull   = p.fullName && p.fullName !== name;
            const isCaptain  = p.teamRole === "captain";
            const busy       = busyId === p.id;
            const amount     = boostAmountFor(p.id);
            const deduct     = amount < 0;

            return (
              <div
                key={p.id}
                className="flex flex-col gap-2 rounded-2xl border border-white/22 bg-[#0d1018] p-3"
              >
                {/* header: name + tags */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium leading-tight text-foreground">
                    {name}
                  </span>
                  {showFull && (
                    <span className="text-xs text-foreground/40">({p.fullName})</span>
                  )}

                  <span
                    className={cn(
                      "rounded-lg border px-2 py-0.5 text-[0.65rem]",
                      p.isSpectator
                        ? "border-blue-400/30 bg-blue-400/10 text-blue-300"
                        : "border-white/10 bg-white/5 text-foreground/60",
                    )}
                  >
                    {p.isSpectator ? "Spectator" : "Competitor"}
                  </span>

                  {p.division && (
                    <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[0.65rem] text-foreground/50">
                      {p.division === "standards" ? "STD" : "OPEN"}
                    </span>
                  )}

                  <span
                    className={cn(
                      "rounded-lg border px-2 py-0.5 text-[0.65rem]",
                      p.onboarded
                        ? "border-green-400/30 bg-green-400/10 text-green-300"
                        : "border-red-400/30 bg-red-400/10 text-red-300/70",
                    )}
                  >
                    {p.onboarded ? "Onboarded" : "Not onboarded"}
                  </span>

                  <span className="ml-auto shrink-0 rounded-lg border border-[#FF6B00]/30 bg-[#FF6B00]/10 px-2 py-0.5 text-[0.65rem] tabular-nums text-[#FF6B00]">
                    {p.tokens} tokens
                  </span>
                </div>

                {/* team + contact row */}
                <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem] text-foreground/60">
                  {p.teamName ? (
                    <>
                      <span className="truncate">{p.teamName}</span>
                      {p.teamRole && (
                        <span
                          className={cn(
                            "rounded-lg border px-2 py-0.5 text-[0.6rem]",
                            isCaptain
                              ? "border-[#FF6B00]/40 bg-[#FF6B00]/15 text-[#FF6B00]"
                              : "border-white/10 bg-white/5 text-foreground/50",
                          )}
                        >
                          {isCaptain ? "Captain" : "Member"}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-foreground/30">No team</span>
                  )}

                  <span className="mx-1 text-foreground/20">·</span>

                  {p.phone ? (
                    <a
                      href={`tel:${p.phone}`}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/8 px-2 py-0.5 text-[0.65rem] text-foreground/60 transition-colors hover:text-foreground/90"
                    >
                      <Phone size={10} strokeWidth={2} />
                      {p.phone}
                    </a>
                  ) : (
                    <span className="text-foreground/30">no number</span>
                  )}

                  {p.email ? (
                    <a
                      href={`mailto:${p.email}`}
                      className="flex items-center gap-1 truncate rounded-lg border border-white/10 bg-white/8 px-2 py-0.5 text-[0.65rem] text-foreground/60 transition-colors hover:text-foreground/90"
                    >
                      <Mail size={10} strokeWidth={2} />
                      {p.email}
                    </a>
                  ) : (
                    <span className="text-foreground/30">no email</span>
                  )}
                </div>

                {/* actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={boostTextFor(p.id)}
                    onChange={e => {
                      // Allow blank, a lone "-", or a signed integer while typing.
                      const v = e.target.value;
                      if (v === "" || v === "-" || /^-?\d+$/.test(v)) setBoostText(p.id, v);
                    }}
                    className="w-16 rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-xs tabular-nums outline-none focus:border-white/30"
                  />
                  <button
                    disabled={busy}
                    onClick={() => handleBoost(p.id)}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-[0.65rem] text-foreground/70 transition-colors hover:text-foreground/95 disabled:opacity-40"
                  >
                    {deduct ? <Minus size={11} strokeWidth={2} /> : <Plus size={11} strokeWidth={2} />}
                    {deduct ? "Deduct" : "Boost"}
                  </button>

                  <button
                    disabled={busy}
                    onClick={() => setKickTarget(p)}
                    className="ml-auto flex items-center gap-1 rounded-lg border border-red-400/40 bg-red-400/15 px-2 py-1 text-[0.65rem] text-red-300 transition-colors hover:bg-red-400/25 disabled:opacity-40"
                  >
                    <Trash2 size={11} strokeWidth={2} />
                    Kick
                  </button>
                </div>
              </div>
            );
          })}

          {!loading && !error && filtered.length === 0 && (
            <p className="px-1 py-4 text-xs text-foreground/40">No players match.</p>
          )}
        </div>
      </div>

      {kickTarget && (
        <ConfirmDialog
          title={`Kick ${displayNameOf(kickTarget)}?`}
          message="This removes their pickabots account, tokens and bets. Their sumobots registration is untouched."
          confirmLabel="Kick"
          onConfirm={() => handleKick(kickTarget.id)}
          onCancel={() => setKickTarget(null)}
        />
      )}
    </div>
  );
}
