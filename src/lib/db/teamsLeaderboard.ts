import "server-only";
import { unstable_cache } from "next/cache";
import supabase from "@/lib/supabase";
import { getBracketState } from "./bracket";
import { fromDbCategory } from "./division";
import { getTokensByName, roundLabel } from "./teamLedger";
import { type BracketMatch, type Division, winner, stageRank } from "@/lib/mock-data";
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
};

function buildEntry({ id, name, kind, division, category, tokens, teamMatches }: EntryInput): TeamLeaderboardEntry {
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
  const [{ data: teamRows, error: tErr }, { data: specialRows, error: sErr }, tokensByName, { matches }] =
    await Promise.all([
      supabase.from("teams").select("id, name, category"),
      supabase.from("special_teams").select("id, name, category"),
      getTokensByName(),
      getBracketState(),
    ]);
  if (tErr) throw new Error(`Failed to load teams: ${tErr.message}`);
  if (sErr) throw new Error(`Failed to load special teams: ${sErr.message}`);

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
