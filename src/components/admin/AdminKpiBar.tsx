"use client";

import { useEffect, useState } from "react";
import { Users, Vote, Clock, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import RamCoin from "@/components/RamCoin";

// A thin, always-visible strip of headline stats — lives in the admin page
// header (see app/admin/page.tsx) rather than inside the Settings panel, so
// it stays on screen no matter which panel tile is open.

type Kpis = {
  onboardedPlayers: number;
  ramCoinCirculated: number;
  votesToday: number;
  matchesDone: number;
  matchesTotal: number;
  estimatedFinishTime: string | null;
  dbLatencyMs: number;
};
type KpisResponse = Kpis | { error: string };

type AccountBalance = { balance: number; currency: string };
type AccountBalanceResponse = AccountBalance | { error: string };

// "System watch" thresholds — when a value crosses these, the chip flags
// instead of showing a bare number. Tuned for a one-day event: the ClickSend
// floor is "still enough credit for a full broadcast", the DB latency
// ceiling is "a query that would visibly stall the admin panel".
const CLICKSEND_CRIT_AUD = 10;
const CLICKSEND_WARN_AUD = 25;
const DB_LATENCY_WARN_MS = 300;
const DB_LATENCY_CRIT_MS = 800;

type WatchStatus = "ok" | "warn" | "crit";

function watchStatus(value: number, warnAt: number, critAt: number, direction: "low" | "high"): WatchStatus {
  if (direction === "low") {
    if (value <= critAt) return "crit";
    if (value <= warnAt) return "warn";
    return "ok";
  }
  if (value >= critAt) return "crit";
  if (value >= warnAt) return "warn";
  return "ok";
}

const DOT_CLASS: Record<WatchStatus, string> = { ok: "bg-green-400", warn: "bg-amber-400", crit: "bg-red-400" };
const TEXT_CLASS: Record<WatchStatus, string> = {
  ok: "text-foreground/70",
  warn: "text-amber-300",
  crit: "text-red-300",
};

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap" title={label}>
      {icon}
      <span className="font-semibold text-foreground">{value}</span>
      <span className="text-foreground/40">{label}</span>
    </span>
  );
}

export default function AdminKpiBar() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [balance, setBalance] = useState<AccountBalance | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  async function loadKpis() {
    try {
      const res = await fetch("/api/admin/kpis");
      const data = (await res.json()) as KpisResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
      setKpis(data);
      setKpisError(null);
    } catch (err) {
      setKpisError(err instanceof Error ? err.message : "Failed to load stats");
    }
  }

  async function loadBalance() {
    try {
      const res = await fetch("/api/admin/account-balance");
      const data = (await res.json()) as AccountBalanceResponse;
      if (!res.ok || "error" in data) throw new Error("error" in data ? data.error : `HTTP ${res.status}`);
      setBalance(data);
      setBalanceError(null);
    } catch (err) {
      setBalanceError(err instanceof Error ? err.message : "Failed to load balance");
    }
  }

  useEffect(() => {
    loadKpis();
    loadBalance();
    const timer = setInterval(() => { loadKpis(); loadBalance(); }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const clickSendStatus = balance ? watchStatus(balance.balance, CLICKSEND_WARN_AUD, CLICKSEND_CRIT_AUD, "low") : null;
  const dbStatus = kpis ? watchStatus(kpis.dbLatencyMs, DB_LATENCY_WARN_MS, DB_LATENCY_CRIT_MS, "high") : null;

  return (
    <div className="glass-nav flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-full px-3 py-1.5 text-[0.7rem]">
      {kpisError && <span className="max-w-[16rem] truncate text-red-300/80" title={kpisError}>{kpisError}</span>}
      {!kpisError && !kpis && <span className="text-foreground/40">Loading stats…</span>}
      {kpis && (
        <>
          <Stat icon={<Users size={12} className="shrink-0 text-foreground/40" />} value={kpis.onboardedPlayers} label="onboarded" />
          <Stat icon={<RamCoin size={12} />} value={kpis.ramCoinCirculated.toLocaleString()} label="RC circulated" />
          <Stat icon={<Vote size={12} className="shrink-0 text-foreground/40" />} value={kpis.votesToday} label="votes today" />
          <Stat
            icon={<Trophy size={12} className="shrink-0 text-foreground/40" />}
            value={<>{kpis.matchesDone}<span className="text-foreground/40">/{kpis.matchesTotal}</span></>}
            label="matches"
          />
          <Stat
            icon={<Clock size={12} className="shrink-0 text-foreground/40" />}
            value={kpis.estimatedFinishTime ?? "—"}
            label="finish"
          />
        </>
      )}

      {/* System watch — flagged rather than shown as bare numbers */}
      <span className="ml-auto flex items-center gap-3 border-l border-white/10 pl-3">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", clickSendStatus ? DOT_CLASS[clickSendStatus] : "bg-white/20")} />
          <span className="text-foreground/40">ClickSend</span>
          {balanceError && <span className="max-w-[12rem] truncate text-red-300/80" title={balanceError}>{balanceError}</span>}
          {!balanceError && !balance && <span className="text-foreground/40">…</span>}
          {balance && (
            <span className={cn("font-medium", clickSendStatus ? TEXT_CLASS[clickSendStatus] : "text-foreground")}>
              {balance.balance.toFixed(2)} {balance.currency}
            </span>
          )}
        </span>
        {kpis && dbStatus && (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASS[dbStatus])} />
            <span className="text-foreground/40">DB</span>
            <span className={cn("font-medium", TEXT_CLASS[dbStatus])}>{kpis.dbLatencyMs}ms</span>
          </span>
        )}
      </span>
    </div>
  );
}
