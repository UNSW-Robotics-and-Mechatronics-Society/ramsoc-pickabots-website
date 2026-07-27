import "server-only";
import supabase from "@/lib/supabase";
import { type Division } from "@/lib/mock-data";
import { getBracketState } from "./bracket";
import { isByeMatch, formatTime } from "@/lib/schedule";

export type Kpis = {
  onboardedPlayers: number;
  ramCoinCirculating: number;
  votesToday: number;
  matchesDone: number;
  matchesTotal: number;
  estimatedFinishTime: string | null;
};

// Start of "today" as a UTC calendar day — a KPI-grade boundary, not
// billing-grade, so a fixed UTC midnight (rather than the event's local
// timezone) is close enough.
function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

async function getPlayerTotals(): Promise<{ onboardedPlayers: number; ramCoinCirculating: number }> {
  const { data, error } = await supabase.from("users").select("tokens").eq("onboarded", true);
  if (error) throw new Error(`Failed to load player totals: ${error.message}`);
  const rows = data ?? [];
  return {
    onboardedPlayers: rows.length,
    ramCoinCirculating: rows.reduce((sum, r) => sum + ((r.tokens as number) ?? 0), 0),
  };
}

async function getVotesToday(): Promise<number> {
  const { count, error } = await supabase
    .from("votes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfTodayIso());
  if (error) throw new Error(`Failed to count today's votes: ${error.message}`);
  return count ?? 0;
}

const DIVISIONS: Division[] = ["standards", "open"];

async function getMatchProgress(): Promise<{ matchesDone: number; matchesTotal: number; estimatedFinishTime: string | null }> {
  const state = await getBracketState();

  const countable = state.matches.filter(m => m.status !== "skipped" && !isByeMatch(m));
  const matchesDone = countable.filter(m => m.status === "completed").length;
  const matchesTotal = countable.length;

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
    estimatedFinishTime: lastEndMinute === null ? null : formatTime(lastEndMinute),
  };
}

export async function getKpis(): Promise<Kpis> {
  const [playerTotals, votesToday, matchProgress] = await Promise.all([
    getPlayerTotals(),
    getVotesToday(),
    getMatchProgress(),
  ]);
  return { ...playerTotals, votesToday, ...matchProgress };
}
