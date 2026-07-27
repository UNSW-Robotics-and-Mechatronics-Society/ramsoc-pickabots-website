import "server-only";
import { unstable_cache } from "next/cache";
import supabase from "@/lib/supabase";
import { getBracketState } from "./bracket";
import { fromDbCategory } from "./division";
import { getTokensByName, roundLabel } from "./teamLedger";
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
  teamMatches: BracketMatch[];
  // Brought back through a wildcard box. Such a team has 2+ losses on record,
  // so without this it would read as knocked out while it's actually playing.
  wildcard: boolean;
  // stageRank of the round the wildcard feeds — a loss at or after it means the
  // second life is over and the team goes back to the knocked-out list.
  wildcardRank: number;
};

function buildEntry({
  id, name, kind, division, category, tokens, teamMatches, wildcard, wildcardRank,
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

  return {
    id, name, kind, division, category, tokens, wins, losses, winRate,
    status, statusLabel,
    eliminated: status === "knocked-out",
  };
}

async function computeTeamsLeaderboard(): Promise<TeamLeaderboardEntry[]> {
  const [{ data: teamRows, error: tErr }, { data: specialRows, error: sErr }, tokensByName, { matches, teamCount }] =
    await Promise.all([
      supabase.from("teams").select("id, name, category"),
      supabase.from("special_teams").select("id, name, category"),
      getTokensByName(),
      getBracketState(),
    ]);
  if (tErr) throw new Error(`Failed to load teams: ${tErr.message}`);
  if (sErr) throw new Error(`Failed to load special teams: ${sErr.message}`);

  // Wildcard boxes are per-division, so the two brackets are read separately.
  const wildcardByDivision = new Map<Division, Set<string>>();
  for (const division of ["standards", "open"] as Division[]) {
    wildcardByDivision.set(division, wildcardTeamNames(matches.filter(m => m.division === division)));
  }
  const wildcardRound = wildcardLbRound(teamCount);
  // Matches the stageRank a losers-bracket match of that round scores.
  const wildcardRank = wildcardRound === null ? Infinity : 5_000 + wildcardRound;

  const entries: TeamLeaderboardEntry[] = [];

  for (const t of teamRows ?? []) {
    const name = t.name as string;
    const division = fromDbCategory(t.category as string);
    entries.push(buildEntry({
      id: `regular:${division}:${name}`,
      name,
      kind: "regular",
      division,
      category: null,
      tokens: tokensByName.get(name) ?? 0,
      // Scoped to the team's own division, so a name reused across the two
      // brackets doesn't pick up the other one's results.
      teamMatches: matches.filter(m =>
        m.division === division && (m.slotA.teamName === name || m.slotB.teamName === name)),
      wildcard: wildcardByDivision.get(division)?.has(name) ?? false,
      wildcardRank,
    }));
  }

  for (const t of specialRows ?? []) {
    const name = t.name as string;
    const category = t.category as string;
    entries.push(buildEntry({
      id: `special:${category}:${name}`,
      name,
      kind: "special",
      division: null,
      category,
      tokens: tokensByName.get(name) ?? 0,
      teamMatches: matches.filter(m => m.slotA.teamName === name || m.slotB.teamName === name),
      wildcard: false, // special teams never enter the bracket, so never a wildcard
      wildcardRank,
    }));
  }

  // Ranked by coins attracted. Knocked-out teams sink below everyone still
  // alive — they keep their relative order down there, forming the greyed
  // "knocked out" tail the UI renders under its own divider.
  entries.sort((a, b) =>
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
