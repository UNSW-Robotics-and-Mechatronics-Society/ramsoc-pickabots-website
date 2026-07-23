import "server-only";
import supabase from "@/lib/supabase";
import { getBracketState } from "./bracket";
import { fromDbCategory } from "./division";
import { type BracketMatch, type Division, winner, stageRank } from "@/lib/mock-data";
import { formatTime } from "@/lib/schedule";

export type TeamLedgerPool = "standards" | "open" | "boss" | "other";

export type TeamLedgerMatchEntry = {
  matchId: string;
  opponentName: string;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  roundLabel: string;
};

export type TeamLedger = {
  name: string;
  kind: "regular" | "special";
  division: Division | null; // regular teams only
  category: string | null;   // special teams only (std/open/boss/other)
  pool: TeamLedgerPool;
  totalTokensBet: number;
  rank: number;
  poolSize: number;
  wins: number;
  losses: number;
  winRate: number;
  pastMatches: TeamLedgerMatchEntry[];
  nextMatch: { opponentName: string; roundLabel: string; time: string | null } | null;
  // Only ever set for regular teams — special teams never enter the
  // elimination bracket, so there's no round to be knocked out of.
  eliminated: { roundLabel: string } | null;
};

// Same labeling as BracketMatchCard.tsx's matchSideLabel(), duplicated here
// rather than imported — that file is a 'use client' component.
function roundLabel(m: BracketMatch): string {
  if (m.side === "finals-semi")  return `Semi ${m.matchNumber}`;
  if (m.side === "finals-third") return "3rd Place";
  if (m.side === "finals-final") return "Grand Final";
  if (m.side === "exhibition")   return "Exhibition";
  return `${m.side === "winners" ? "W" : "L"}B R${m.round}`;
}

// A special team's category tag maps onto the same ranking pool as the
// matching real-team division when it's std/open — there's no equivalent
// real-team pool for boss/other, so those rank only against each other.
function poolFor(category: string): TeamLedgerPool {
  if (category === "std") return "standards";
  if (category === "open") return "open";
  return category as TeamLedgerPool;
}

async function getTokensByName(): Promise<Map<string, number>> {
  const [{ data: matchRows, error: mErr }, { data: voteRows, error: vErr }] = await Promise.all([
    supabase.from("matches").select("id, left_name, right_name"),
    supabase.from("votes").select("match_id, side, amount"),
  ]);
  if (mErr) throw new Error(`Failed to load matches: ${mErr.message}`);
  if (vErr) throw new Error(`Failed to load votes: ${vErr.message}`);

  const matchById = new Map((matchRows ?? []).map(m => [m.id as string, m]));
  const totals = new Map<string, number>();
  for (const v of voteRows ?? []) {
    const m = matchById.get(v.match_id as string);
    if (!m) continue;
    const name = v.side === "left" ? (m.left_name as string) : (m.right_name as string);
    totals.set(name, (totals.get(name) ?? 0) + (v.amount as number));
  }
  return totals;
}

export async function getTeamLedger(name: string, divisionHint?: Division): Promise<TeamLedger | null> {
  const [{ data: teamRows, error: teamsErr }, { data: specialRows, error: specialErr }, tokensByName, bracketState] =
    await Promise.all([
      supabase.from("teams").select("id, name, category"),
      supabase.from("special_teams").select("id, name, category"),
      getTokensByName(),
      getBracketState(),
    ]);
  if (teamsErr) throw new Error(`Failed to load teams: ${teamsErr.message}`);
  if (specialErr) throw new Error(`Failed to load special teams: ${specialErr.message}`);

  const matchingTeams = (teamRows ?? []).filter(t => t.name === name);
  const matchingSpecial = (specialRows ?? []).filter(t => t.name === name);

  let kind: "regular" | "special";
  let division: Division | null = null;
  let category: string | null = null;

  if (matchingTeams.length > 0) {
    kind = "regular";
    const preferred = divisionHint
      ? matchingTeams.find(t => fromDbCategory(t.category as string) === divisionHint)
      : undefined;
    division = fromDbCategory((preferred ?? matchingTeams[0]).category as string);
  } else if (matchingSpecial.length > 0) {
    kind = "special";
    category = matchingSpecial[0].category as string;
  } else {
    return null;
  }

  const pool: TeamLedgerPool = kind === "regular" ? (division as TeamLedgerPool) : poolFor(category!);

  // ── ranking within the pool ────────────────────────────────────────────────
  const poolEntries: { name: string; tokens: number }[] = [];
  for (const t of teamRows ?? []) {
    if (fromDbCategory(t.category as string) === pool) {
      poolEntries.push({ name: t.name as string, tokens: tokensByName.get(t.name as string) ?? 0 });
    }
  }
  for (const t of specialRows ?? []) {
    if (poolFor(t.category as string) === pool) {
      poolEntries.push({ name: t.name as string, tokens: tokensByName.get(t.name as string) ?? 0 });
    }
  }
  poolEntries.sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
  const rank = poolEntries.findIndex(e => e.name === name) + 1;
  const poolSize = poolEntries.length;

  // ── matches this team has played ───────────────────────────────────────────
  const { matches, schedules, exhibitionSchedule } = bracketState;
  const teamMatches = matches.filter(m => m.slotA.teamName === name || m.slotB.teamName === name);

  let wins = 0;
  let losses = 0;
  let eliminated: TeamLedger["eliminated"] = null;
  const decorated: { entry: TeamLedgerMatchEntry; rank: number }[] = [];

  for (const m of teamMatches) {
    if (m.status !== "completed") continue;
    const w = winner(m);
    const isA = m.slotA.teamName === name;
    const won = (isA && w === "a") || (!isA && w === "b");
    if (won) wins++; else losses++;
    if (!won && m.side === "losers") eliminated = { roundLabel: roundLabel(m) };

    decorated.push({
      rank: stageRank(m),
      entry: {
        matchId: m.id,
        opponentName: isA ? m.slotB.teamName : m.slotA.teamName,
        teamScore: isA ? m.slotA.score : m.slotB.score,
        opponentScore: isA ? m.slotB.score : m.slotA.score,
        won,
        roundLabel: roundLabel(m),
      },
    });
  }
  decorated.sort((a, b) => b.rank - a.rank); // most recent first
  const pastMatches = decorated.map(d => d.entry);

  // ── next match ──────────────────────────────────────────────────────────────
  const upcoming = teamMatches
    .filter(m => m.status === "active" || m.status === "next" || m.status === "todo")
    .sort((a, b) => stageRank(a) - stageRank(b));
  let nextMatch: TeamLedger["nextMatch"] = null;
  if (upcoming.length > 0) {
    const m = upcoming[0];
    const isA = m.slotA.teamName === name;
    const schedule = schedules[m.division];
    const timeByMatchId = new Map(
      [...schedule.rings.flat(), ...exhibitionSchedule.rings.flat()].map(e => [e.matchId, e.startMinute])
    );
    const minute = timeByMatchId.get(m.id);
    nextMatch = {
      opponentName: isA ? m.slotB.teamName : m.slotA.teamName,
      roundLabel: roundLabel(m),
      time: minute !== undefined ? formatTime(minute) : null,
    };
  }

  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  return {
    name,
    kind,
    division,
    category,
    pool,
    totalTokensBet: tokensByName.get(name) ?? 0,
    rank,
    poolSize,
    wins,
    losses,
    winRate,
    pastMatches,
    nextMatch,
    eliminated,
  };
}
