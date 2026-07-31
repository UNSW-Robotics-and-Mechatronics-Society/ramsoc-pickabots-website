import "server-only";
import { unstable_cache } from "next/cache";
import supabase from "@/lib/supabase";
import { getBracketState } from "./bracket";
import { fromDbCategory } from "./division";
import { getVoteStatsByName, roundLabel } from "./teamLedger";
import { getTeamStatusOverrides } from "./config";
import { type BracketMatch, type Division, winner, stageRank, wildcardLbRound, wildcardTeamNames } from "@/lib/mock-data";
import type { TeamLeaderboardEntry, TeamStatusKind } from "@/lib/types";

export type { TeamLeaderboardEntry, TeamStatusKind };

const SPECIAL_STATUS_LABEL: Record<string, string> = { boss: "Boss" };

type EntryInput = {
  id: string;
  name: string;
  kind: "regular" | "special";
  division: Division | null;
  category: string | null;
  tokens: number;
  votes: number;
  teamMatches: BracketMatch[];
  // Brought back through a wildcard box. Such a team has 2+ losses on record,
  // so without this it would read as knocked out while it's actually playing.
  wildcard: boolean;
  // stageRank of the round the wildcard feeds — a loss at or after it means the
  // second life is over and the team goes back to the knocked-out list.
  wildcardRank: number;
  // Admin override (see getTeamStatusOverrides): true = eliminated, false =
  // still in, null/undefined = derive from the bracket as usual.
  override: boolean | null;
};

function buildEntry({
  id, name, kind, division, category, tokens, votes, teamMatches, wildcard, wildcardRank, override,
}: EntryInput): TeamLeaderboardEntry {
  let wins = 0;
  let losses = 0;
  // Bracket losses only, each with its chronological position, so a knocked-out
  // team can be labelled with the round of its SECOND loss — the one that ended
  // the run. Exhibition matches are excluded: they're ad-hoc games outside the
  // tournament, so losing one must never eliminate a team. They still count
  // toward W/L below, which keeps this row's record equal to the one the team's
  // modal shows.
  const bracketLosses: { rank: number; label: string }[] = [];
  let bracketMatchCount = 0;
  let finalResult: "won" | "lost" | null = null;

  for (const m of teamMatches) {
    // A wildcard box is a holding slot, not a played match — it has
    // targetScore 0, so winner() would score it as a free win. Skip entirely:
    // it contributes no W/L and doesn't count as being drawn into the bracket.
    if (m.side === "wildcard") continue;
    const isExhibition = m.side === "exhibition";
    if (!isExhibition) bracketMatchCount++;
    if (m.status !== "completed") continue;
    const w = winner(m);
    if (!w) continue; // completed but undecided — don't score it either way
    const isA = m.slotA.teamName === name;
    const won = (isA && w === "a") || (!isA && w === "b");
    if (won) wins++;
    else {
      losses++;
      if (!isExhibition) bracketLosses.push({ rank: stageRank(m), label: roundLabel(m) });
    }
    if (m.side === "finals-final") finalResult = won ? "won" : "lost";
  }

  const played = wins + losses;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

  let status: TeamStatusKind;
  let statusLabel: string;

  if (kind === "special") {
    status = "special";
    statusLabel = SPECIAL_STATUS_LABEL[category ?? ""] ?? "Special";
  } else if (bracketMatchCount === 0) {
    status = "unentered";
    statusLabel = "Not Drawn";
  } else if (finalResult) {
    // Checked before the two-loss rule: a Grand Final loser who came up
    // through the losers bracket has two losses but is the runner-up, not
    // another knocked-out team.
    status = finalResult === "won" ? "champion" : "runner-up";
    statusLabel = finalResult === "won" ? "Champion" : "Runner-up";
  } else if (wildcard) {
    // A wildcard's pre-wildcard losses don't count against it any more — only a
    // loss from the round it re-entered at onward ends the second life.
    const since = bracketLosses.filter(l => l.rank >= wildcardRank).sort((a, b) => a.rank - b.rank);
    if (since.length > 0) {
      status = "knocked-out";
      statusLabel = since[0].label;
    } else {
      status = "wildcard";
      statusLabel = "Wildcard";
    }
  } else if (bracketLosses.length >= 2) {
    bracketLosses.sort((a, b) => a.rank - b.rank);
    status = "knocked-out";
    statusLabel = bracketLosses[1].label;
  } else if (bracketLosses.length === 1) {
    status = "losers";
    statusLabel = "Losers";
  } else {
    status = "winners";
    statusLabel = "Winners";
  }

  // An admin override wins over everything derived above. Applied last, not as
  // another branch, so it can keep the derived label where that label is still
  // the truthful one: a team knocked out by hand because its eliminating loss
  // was never recorded has no round to name, but one being forced out that the
  // bracket already knocked out keeps its real round.
  if (override === true) {
    if (status !== "knocked-out") statusLabel = "Eliminated";
    status = "knocked-out";
  } else if (override === false && (status === "knocked-out" || status === "unentered")) {
    // Forced back in. "Still In" rather than a bracket round, because the whole
    // reason for the override is that the bracket can't say where they are.
    status = "winners";
    statusLabel = "Still In";
  }

  return {
    id, name, kind, division, category, tokens, votes, wins, losses, winRate,
    status, statusLabel,
    eliminated: status === "knocked-out",
    forcedAlive: override === false,
  };
}

async function computeTeamsLeaderboard(): Promise<TeamLeaderboardEntry[]> {
  const [
    { data: teamRows, error: tErr }, { data: specialRows, error: sErr },
    statsByName, { matches, teamCounts }, overrides,
  ] = await Promise.all([
      supabase.from("teams").select("id, name, category"),
      supabase.from("special_teams").select("id, name, category"),
      getVoteStatsByName(),
      getBracketState(),
      // Keyed by the teams/special_teams row id, NOT by the composite entry id
      // below — the override has to survive a team being renamed.
      getTeamStatusOverrides(),
    ]);
  if (tErr) throw new Error(`Failed to load teams: ${tErr.message}`);
  if (sErr) throw new Error(`Failed to load special teams: ${sErr.message}`);

  // Wildcard boxes are per-division, so the two brackets are read separately.
  const wildcardByDivision = new Map<Division, Set<string>>();
  for (const division of ["standards", "open"] as Division[]) {
    wildcardByDivision.set(division, wildcardTeamNames(matches.filter(m => m.division === division)));
  }
  // Which losers-bracket round the wildcards feed depends on the bracket's
  // size, and the two divisions can be sized differently — so this is per
  // division too. Matches the stageRank a losers-bracket match of that round
  // scores.
  const wildcardRankByDivision = new Map<Division, number>();
  for (const division of ["standards", "open"] as Division[]) {
    const round = wildcardLbRound(teamCounts[division]);
    wildcardRankByDivision.set(division, round === null ? Infinity : 5_000 + round);
  }

  const entries: TeamLeaderboardEntry[] = [];

  for (const t of teamRows ?? []) {
    const name = t.name as string;
    const division = fromDbCategory(t.category as string);
    const stats = statsByName.get(name);
    entries.push(buildEntry({
      id: `regular:${division}:${name}`,
      name,
      kind: "regular",
      division,
      category: null,
      tokens: stats?.tokens ?? 0,
      votes: stats?.votes ?? 0,
      // Scoped to the team's own division, so a name reused across the two
      // brackets doesn't pick up the other one's results.
      teamMatches: matches.filter(m =>
        m.division === division && (m.slotA.teamName === name || m.slotB.teamName === name)),
      wildcard: wildcardByDivision.get(division)?.has(name) ?? false,
      wildcardRank: wildcardRankByDivision.get(division) ?? Infinity,
      override: overrides[t.id as string] ?? null,
    }));
  }

  for (const t of specialRows ?? []) {
    const name = t.name as string;
    const category = t.category as string;
    const stats = statsByName.get(name);
    entries.push(buildEntry({
      id: `special:${category}:${name}`,
      name,
      kind: "special",
      division: null,
      category,
      tokens: stats?.tokens ?? 0,
      votes: stats?.votes ?? 0,
      teamMatches: matches.filter(m => m.slotA.teamName === name || m.slotB.teamName === name),
      wildcard: false, // special teams never enter the bracket, so never a wildcard
      // Never in a bracket, so there's no wildcard round for them to be knocked
      // out after — Infinity leaves their status untouched by that rule.
      wildcardRank: Infinity,
      override: overrides[t.id as string] ?? null,
    }));
  }

  // Ranked by coins attracted, in three tiers, each rendered under its own
  // divider and greyed from the second down (see TeamBoard):
  //   1. voted-on and still alive — the leaderboard proper
  //   2. voted-on but knocked out
  //   3. nobody has voted on them yet — no ranking signal at all, so they sit
  //      below even the knocked-out tail until their first vote lands, which
  //      promotes them into tier 1 or 2 on the next refresh.
  // Within every tier: most coins first, then alphabetical.
  //
  // A team an admin has marked still-in is exempt from tier 3 even on 0 votes:
  // "they're still playing" is a stronger statement than "nobody has bet on
  // them", and burying a live finalist under the un-voted-on tail reads as a bug.
  // Keep this in step with TeamBoard's tierOf.
  const unvoted = (e: TeamLeaderboardEntry) => e.votes === 0 && !e.forcedAlive;
  entries.sort((a, b) =>
    Number(unvoted(a)) - Number(unvoted(b)) ||
    Number(a.eliminated) - Number(b.eliminated) ||
    b.tokens - a.tokens ||
    a.name.localeCompare(b.name));

  return entries;
}

// Cached and invalidated on the same events as the player leaderboard, so both
// boards move together when a game resolves: 'leaderboard' (bracket save, and
// the non-game token changes) and 'bracket' (the W/L + knocked-out status this
// reads from bracket_matches). Note this means the coins-bet column deliberately
// does NOT tick up bet-by-bet during a voting window — same as the player board,
// which holds still between games rather than churning on every vote.
export const getTeamsLeaderboard = unstable_cache(computeTeamsLeaderboard, ["teams-leaderboard"], {
  revalidate: 300,
  tags: ["leaderboard", "bracket"],
});
