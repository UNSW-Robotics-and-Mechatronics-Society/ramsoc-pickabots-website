import "server-only";
import supabase from "@/lib/supabase";
import { type Division } from "@/lib/mock-data";
import { getBracketState } from "./bracket";
import { isByeMatch, formatTime } from "@/lib/schedule";

export type PhaseProgress = { label: string; done: number; total: number };

export type Kpis = {
  onboardedPlayers: number;
  ramCoinCirculated: number;
  votesToday: number;
  votesByHour: number[]; // one bucket per hour of today so far, index 0 = midnight UTC
  matchesDone: number;
  matchesTotal: number;
  matchesByPhase: PhaseProgress[]; // Winners / Losers knockouts, then Finals — same order tournament plays in
  estimatedFinishTime: string | null;
  dbLatencyMs: number; // round-trip of a trivial query — an early "is something about to break" signal
};

// Start of "today" as a UTC calendar day — a KPI-grade boundary, not
// billing-grade, so a fixed UTC midnight (rather than the event's local
// timezone) is close enough.
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Round-trip time of a trivial query — a cheap proxy for "is the DB under strain right now". */
async function getDbLatencyMs(): Promise<number> {
  const start = Date.now();
  const { error } = await supabase.from("pickabots_config").select("key").limit(1);
  if (error) throw new Error(`Failed to measure DB latency: ${error.message}`);
  return Date.now() - start;
}

async function getOnboardedPlayerCount(): Promise<number> {
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("onboarded", true);
  if (error) throw new Error(`Failed to count onboarded players: ${error.message}`);
  return count ?? 0;
}

/** Total RamCoin ever staked — the sum of every bid's amount, all-time (not the current balance sum). */
async function getRamCoinCirculated(): Promise<number> {
  const { data, error } = await supabase.from("votes").select("amount");
  if (error) throw new Error(`Failed to sum RamCoin circulated: ${error.message}`);
  return (data ?? []).reduce((sum, r) => sum + ((r.amount as number) ?? 0), 0);
}

/** Today's votes, both the running total and an hourly breakdown (midnight UTC .. now). */
async function getVotesToday(): Promise<{ votesToday: number; votesByHour: number[] }> {
  const start = startOfTodayUtc();
  const { data, error } = await supabase.from("votes").select("created_at").gte("created_at", start.toISOString());
  if (error) throw new Error(`Failed to load today's votes: ${error.message}`);

  const rows = data ?? [];
  const currentHour = new Date().getUTCHours();
  const votesByHour = new Array<number>(currentHour + 1).fill(0);
  for (const r of rows) {
    const hour = new Date(r.created_at as string).getUTCHours();
    if (hour >= 0 && hour < votesByHour.length) votesByHour[hour]++;
  }

  return { votesToday: rows.length, votesByHour };
}

const DIVISIONS: Division[] = ["standards", "open"];
const FINALS_SIDES = new Set(["finals-semi", "finals-third", "finals-final"]);

async function getMatchProgress(): Promise<{
  matchesDone: number;
  matchesTotal: number;
  matchesByPhase: PhaseProgress[];
  estimatedFinishTime: string | null;
}> {
  const state = await getBracketState();

  const countable = state.matches.filter(m => m.status !== "skipped" && !isByeMatch(m));
  const matchesDone = countable.filter(m => m.status === "completed").length;
  const matchesTotal = countable.length;

  // Tournament-progression view: Winners/Losers knockouts, then Finals Day.
  // Exhibition/wildcard matches sit outside the elimination pipeline, so they're
  // in matchesDone/matchesTotal above but left out of this phase breakdown.
  const phaseOf = (side: string) => (side === "winners" ? "Winners" : side === "losers" ? "Losers" : FINALS_SIDES.has(side) ? "Finals" : null);
  const phaseTotals = new Map<string, PhaseProgress>();
  for (const label of ["Winners", "Losers", "Finals"]) phaseTotals.set(label, { label, done: 0, total: 0 });
  for (const m of countable) {
    const phase = phaseOf(m.side);
    if (!phase) continue;
    const p = phaseTotals.get(phase)!;
    p.total++;
    if (m.status === "completed") p.done++;
  }
  const matchesByPhase = [...phaseTotals.values()];

  let lastEndMinute: number | null = null;
  for (const division of DIVISIONS) {
    const sched = state.schedules[division];
    for (const ring of sched.rings) {
      const last = ring[ring.length - 1];
      if (!last) continue;
      const end = last.startMinute + sched.matchMinutes;
      lastEndMinute = lastEndMinute === null ? end : Math.max(lastEndMinute, end);
    }
  }
  for (const ring of state.exhibitionSchedule.rings) {
    const last = ring[ring.length - 1];
    if (!last) continue;
    const end = last.startMinute + state.exhibitionSchedule.matchMinutes;
    lastEndMinute = lastEndMinute === null ? end : Math.max(lastEndMinute, end);
  }

  return {
    matchesDone,
    matchesTotal,
    matchesByPhase,
    estimatedFinishTime: lastEndMinute === null ? null : formatTime(lastEndMinute),
  };
}

export async function getKpis(): Promise<Kpis> {
  const [onboardedPlayers, ramCoinCirculated, votes, matchProgress, dbLatencyMs] = await Promise.all([
    getOnboardedPlayerCount(),
    getRamCoinCirculated(),
    getVotesToday(),
    getMatchProgress(),
    getDbLatencyMs(),
  ]);
  return { onboardedPlayers, ramCoinCirculated, ...votes, ...matchProgress, dbLatencyMs };
}
