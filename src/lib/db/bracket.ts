import "server-only";
import supabase from "@/lib/supabase";
import {
  type BracketMatch, type BracketSide, type Division, type MatchStatus, type TeamCount,
  generateDoubleElimBracket, winner,
} from "@/lib/mock-data";
import { type MatchSchedule, generateSchedule, defaultScheduleOrder } from "@/lib/schedule";
import { toDbCategory, fromDbCategory } from "./division";

const DIVISIONS: Division[] = ["standards", "open"];
const DEFAULT_TEAM_COUNT: TeamCount = 16;

type BracketMatchRow = {
  id: string;
  division: string;
  side: string;
  round: number;
  match_number: number;
  slot_a_name: string;
  slot_a_score: number;
  slot_b_name: string;
  slot_b_score: number;
  target_score: number;
  status: string;
};

function rowToMatch(r: BracketMatchRow): BracketMatch {
  return {
    id: r.id,
    division: fromDbCategory(r.division),
    side: r.side as BracketSide,
    round: r.round,
    matchNumber: r.match_number,
    slotA: { teamName: r.slot_a_name, score: r.slot_a_score },
    slotB: { teamName: r.slot_b_name, score: r.slot_b_score },
    targetScore: r.target_score,
    status: r.status as MatchStatus,
  };
}

function matchToRow(m: BracketMatch, teamIdByName: Map<string, string>) {
  return {
    id: m.id,
    division: toDbCategory(m.division),
    side: m.side,
    round: m.round,
    match_number: m.matchNumber,
    slot_a_name: m.slotA.teamName,
    slot_a_team_id: teamIdByName.get(m.slotA.teamName) ?? null,
    slot_a_score: m.slotA.score,
    slot_b_name: m.slotB.teamName,
    slot_b_team_id: teamIdByName.get(m.slotB.teamName) ?? null,
    slot_b_score: m.slotB.score,
    target_score: m.targetScore,
    status: m.status,
  };
}

export type BracketState = {
  matches: BracketMatch[];
  teamCount: TeamCount;
  schedules: Record<Division, MatchSchedule>;
};

export async function getBracketState(): Promise<BracketState> {
  const [{ data: matchRows, error: mErr }, { data: configRows, error: cErr }, { data: scheduleRows, error: sErr }] =
    await Promise.all([
      supabase.from("bracket_matches").select("*"),
      supabase.from("bracket_config").select("*"),
      supabase.from("bracket_schedule").select("*"),
    ]);
  if (mErr) throw new Error(`Failed to load bracket_matches: ${mErr.message}`);
  if (cErr) throw new Error(`Failed to load bracket_config: ${cErr.message}`);
  if (sErr) throw new Error(`Failed to load bracket_schedule: ${sErr.message}`);

  // team_count is a single value shared across both divisions today (see
  // AdminPageClient.applySizeChange, which regenerates the OTHER division at
  // the same size whenever one division is resized) — read the 'standard'
  // row as canonical.
  const teamCount = ((configRows ?? []).find(c => c.division === "standard")?.team_count as TeamCount)
    ?? DEFAULT_TEAM_COUNT;

  let matches = (matchRows ?? []).map(rowToMatch);
  for (const division of DIVISIONS) {
    if (!matches.some(m => m.division === division)) {
      matches = [...matches, ...generateDoubleElimBracket(teamCount, division)];
    }
  }

  const schedules = {} as Record<Division, MatchSchedule>;
  for (const division of DIVISIONS) {
    const row = (scheduleRows ?? []).find(s => fromDbCategory(s.division as string) === division);
    schedules[division] = row
      ? (row.schedule as MatchSchedule)
      : generateSchedule(defaultScheduleOrder(matches, division));
  }

  return { matches, teamCount, schedules };
}

/**
 * Opens/resolves betting matches in response to bracket status changes.
 * Best-effort: a failure here is logged but doesn't fail the bracket save,
 * since the admin's primary action (recording the bracket result) already
 * succeeded by the time this runs.
 */
async function syncBettingMatches(beforeStatusById: Map<string, MatchStatus>, after: BracketMatch[]): Promise<void> {
  for (const m of after) {
    const prevStatus = beforeStatusById.get(m.id);
    if (prevStatus === m.status) continue;

    if (m.status === "active") {
      const { data: existing } = await supabase
        .from("matches").select("id").eq("bracket_match_id", m.id).maybeSingle();
      if (!existing) {
        await supabase.from("matches").insert({
          bracket_match_id: m.id,
          comp_type: toDbCategory(m.division),
          left_name: m.slotA.teamName || "TBD",
          right_name: m.slotB.teamName || "TBD",
          is_active: true,
        });
      }
    } else if (m.status === "completed") {
      const w = winner(m);
      if (!w) continue;
      await supabase
        .from("matches")
        .update({ winner_side: w === "a" ? "left" : "right", is_active: false })
        .eq("bracket_match_id", m.id);
    }
  }
}

export async function saveBracketState(state: BracketState): Promise<void> {
  const { matches, teamCount, schedules } = state;

  const [{ data: existingRows, error: exErr }, { data: teamRows, error: teamErr }] = await Promise.all([
    supabase.from("bracket_matches").select("id, status"),
    supabase.from("teams").select("id, name"),
  ]);
  if (exErr) throw new Error(`Failed to read existing bracket_matches: ${exErr.message}`);
  if (teamErr) throw new Error(`Failed to read teams: ${teamErr.message}`);

  const beforeStatusById = new Map((existingRows ?? []).map(r => [r.id as string, r.status as MatchStatus]));
  const teamIdByName = new Map((teamRows ?? []).map(t => [t.name as string, t.id as string]));

  // Resize can drop early rounds (see transferBracket) — delete rows that no
  // longer correspond to any match in the new set, don't just upsert.
  const newIds = new Set(matches.map(m => m.id));
  const staleIds = (existingRows ?? []).map(r => r.id as string).filter(id => !newIds.has(id));
  if (staleIds.length > 0) {
    const { error } = await supabase.from("bracket_matches").delete().in("id", staleIds);
    if (error) throw new Error(`Failed to delete stale bracket_matches: ${error.message}`);
  }

  const rows = matches.map(m => matchToRow(m, teamIdByName));
  const { error: upsertErr } = await supabase.from("bracket_matches").upsert(rows, { onConflict: "id" });
  if (upsertErr) throw new Error(`Failed to save bracket_matches: ${upsertErr.message}`);

  const { error: configErr } = await supabase
    .from("bracket_config")
    .upsert(DIVISIONS.map(d => ({ division: toDbCategory(d), team_count: teamCount })), { onConflict: "division" });
  if (configErr) throw new Error(`Failed to save bracket_config: ${configErr.message}`);

  const { error: schedErr } = await supabase
    .from("bracket_schedule")
    .upsert(
      DIVISIONS.map(d => ({ division: toDbCategory(d), schedule: schedules[d], updated_at: new Date().toISOString() })),
      { onConflict: "division" },
    );
  if (schedErr) throw new Error(`Failed to save bracket_schedule: ${schedErr.message}`);

  try {
    await syncBettingMatches(beforeStatusById, matches);
  } catch (err) {
    console.error("[bracket] betting sync failed:", err);
  }
}
