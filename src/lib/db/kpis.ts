import "server-only";
import supabase from "@/lib/supabase";
import { type Division } from "@/lib/mock-data";
import { getBracketState } from "./bracket";
import { isByeMatch, formatTime, type RingMatch } from "@/lib/schedule";

export type Kpis = {
  onboardedPlayers: number;
  onboardedByHour: number[]; // new-onboarded-today count per hour so far, index 0 = midnight UTC
  ramCoinCirculated: number;
  ramCoinByHour: number[]; // RamCoin staked today per hour so far
  votesToday: number;
  votesByHour: number[]; // vote count today per hour so far
  matchesDone: number;
  matchesTotal: number;
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

/** Buckets `timestamps` into one count per hour, 0..currentHour (today so far). */
function bucketByHour(timestamps: string[]): number[] {
  const currentHour = new Date().getUTCHours();
  const buckets = new Array<number>(currentHour + 1).fill(0);
  for (const ts of timestamps) {
    const hour = new Date(ts).getUTCHours();
    if (hour >= 0 && hour < buckets.length) buckets[hour]++;
  }
  return buckets;
}

/** Round-trip time of a trivial query — a cheap proxy for "is the DB under strain right now". */
async function getDbLatencyMs(): Promise<number> {
  const start = Date.now();
  const { error } = await supabase.from("pickabots_config").select("key").limit(1);
  if (error) throw new Error(`Failed to measure DB latency: ${error.message}`);
  return Date.now() - start;
}

async function getOnboardedPlayers(): Promise<{ onboardedPlayers: number; onboardedByHour: number[] }> {
  const [{ count, error: countErr }, { data: todayRows, error: todayErr }] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }).eq("onboarded", true),
    supabase.from("users").select("created_at").eq("onboarded", true).gte("created_at", startOfTodayUtc().toISOString()),
  ]);
  if (countErr) throw new Error(`Failed to count onboarded players: ${countErr.message}`);
  if (todayErr) throw new Error(`Failed to load today's onboarded players: ${todayErr.message}`);
  return {
    onboardedPlayers: count ?? 0,
    onboardedByHour: bucketByHour((todayRows ?? []).map(r => r.created_at as string)),
  };
}

/** Today's votes: running total, RamCoin staked, and both broken down hourly. */
async function getVotesToday(): Promise<{ votesToday: number; votesByHour: number[]; ramCoinByHour: number[] }> {
  const { data, error } = await supabase
    .from("votes")
    .select("amount, created_at")
    .gte("created_at", startOfTodayUtc().toISOString());
  if (error) throw new Error(`Failed to load today's votes: ${error.message}`);

  const rows = data ?? [];
  const currentHour = new Date().getUTCHours();
  const votesByHour = new Array<number>(currentHour + 1).fill(0);
  const ramCoinByHour = new Array<number>(currentHour + 1).fill(0);
  for (const r of rows) {
    const hour = new Date(r.created_at as string).getUTCHours();
    if (hour < 0 || hour >= votesByHour.length) continue;
    votesByHour[hour]++;
    ramCoinByHour[hour] += (r.amount as number) ?? 0;
  }

  return { votesToday: rows.length, votesByHour, ramCoinByHour };
}

/** Total RamCoin ever staked — the sum of every bid's amount, all-time (not the current balance sum). */
async function getRamCoinCirculated(): Promise<number> {
  const { data, error } = await supabase.from("votes").select("amount");
  if (error) throw new Error(`Failed to sum RamCoin circulated: ${error.message}`);
  return (data ?? []).reduce((sum, r) => sum + ((r.amount as number) ?? 0), 0);
}

const DIVISIONS: Division[] = ["standards", "open"];

async function getMatchProgress(): Promise<{ matchesDone: number; matchesTotal: number; estimatedFinishTime: string | null }> {
  const state = await getBracketState();

  const countable = state.matches.filter(m => m.status !== "skipped" && !isByeMatch(m));
  const matchesDone = countable.filter(m => m.status === "completed").length;
  const matchesTotal = countable.length;

  // When each ring finishes = its LATEST slot by time + one match length. The
  // latest slot is not the last one in the queue: a ring's queue is ordered by
  // play position, not by clock time. retimeRings freezes a completed match at
  // the time it actually played while the pending queue reflows around it, so
  // marking a match Done out of queue order — routine at a live event — leaves
  // an already-played slot sitting last. Reading that slot made the estimate
  // jump BACKWARDS, reporting a finish time earlier than matches still to come.
  const ringEnds: number[] = [];
  function addRingEnds(rings: RingMatch[][], matchMinutes: number) {
    for (const ring of rings) {
      if (ring.length === 0) continue;
      ringEnds.push(Math.max(...ring.map(e => e.startMinute)) + matchMinutes);
    }
  }
  for (const division of DIVISIONS) {
    const sched = state.schedules[division];
    addRingEnds(sched.rings, sched.matchMinutes);
  }
  addRingEnds(state.exhibitionSchedule.rings, state.exhibitionSchedule.matchMinutes);

  const lastEndMinute = ringEnds.length ? Math.max(...ringEnds) : null;

  return {
    matchesDone,
    matchesTotal,
    // Past midnight, the bare clock time reads as EARLIER than the event's
    // start ("12:30 AM" against a 1:00 PM start), so mark the day rollover.
    estimatedFinishTime: lastEndMinute === null
      ? null
      : formatTime(lastEndMinute) + (lastEndMinute >= 24 * 60 ? ' +1d' : ''),
  };
}

export async function getKpis(): Promise<Kpis> {
  const [onboarded, ramCoinCirculated, votes, matchProgress, dbLatencyMs] = await Promise.all([
    getOnboardedPlayers(),
    getRamCoinCirculated(),
    getVotesToday(),
    getMatchProgress(),
    getDbLatencyMs(),
  ]);
  return { ...onboarded, ramCoinCirculated, ...votes, ...matchProgress, dbLatencyMs };
}
