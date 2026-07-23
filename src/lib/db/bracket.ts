import "server-only";
import supabase from "@/lib/supabase";
import {
  type BracketMatch, type BracketSide, type Division, type MatchStatus, type TeamCount,
  generateDoubleElimBracket, winner,
} from "@/lib/mock-data";
import { type MatchSchedule, generateSchedule, applyScheduleStatus, rollSchedule } from "@/lib/schedule";
import { toDbCategory, fromDbCategory } from "./division";
import { rewardWinners } from "./rewards";

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
  voting_open: boolean | null;
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
    // Default closed for rows created before this column existed.
    votingOpen: r.voting_open ?? false,
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
    voting_open: m.votingOpen,
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
    const existing = row ? (row.schedule as MatchSchedule) : generateSchedule([], 2);
    // Roll on read: strip any stale "waiting"/bye entries and surface only the
    // currently-playable matches, so the admin and public always see a
    // rolling schedule (and never a match parked with unknown teams).
    schedules[division] = rollSchedule(existing, matches, division);
  }

  return { matches, teamCount, schedules };
}

/**
 * Marks a vote row's outcome once its bracket match resolves. Only
 * "completed" is handled transition-gated (not folded into the full
 * reconciliation below) because it's a one-way event — a completed match
 * never needs its winner_side re-derived on a later save. Best-effort: a
 * failure here is logged but doesn't fail the bracket save, since the
 * admin's primary action (recording the bracket result) already succeeded
 * by the time this runs.
 */
async function syncCompletedMatches(beforeStatusById: Map<string, MatchStatus>, after: BracketMatch[]): Promise<void> {
  for (const m of after) {
    if (m.status !== "completed" || beforeStatusById.get(m.id) === m.status) continue;
    const w = winner(m);
    console.log("[syncCompletedMatches] newly completed:", m.id, "winner:", w);
    if (!w) continue;
    const winnerSide = w === "a" ? "left" : "right";
    const { data: matchRows, error: updateErr } = await supabase
      .from("matches")
      .update({ winner_side: winnerSide, is_active: false })
      .eq("bracket_match_id", m.id)
      .select("id");

    console.log("[syncCompletedMatches] matches updated:", matchRows, "err:", updateErr);

    for (const row of matchRows ?? []) {
      console.log("[syncCompletedMatches] rewarding winners for match", row.id, "winner:", winnerSide);
      await rewardWinners(row.id, winnerSide).catch(err =>
        console.error("[syncCompletedMatches] reward failed for match", row.id, err)
      );
    }
  }
}

/**
 * Full reconciliation of the public voting `matches` table against the
 * bracket's current active/next matches — runs on every save (not gated on
 * detecting a transition this round), so it self-heals regardless of how
 * a mismatch happened: creates a row for any active/next bracket match
 * that doesn't have one yet (e.g. it became "next" before this
 * reconciliation existed, or the one-shot transition sync it replaced
 * missed it), corrects is_active/names on rows that drifted (a match that
 * was active and got bumped back to "next" by a ring/schedule change, or
 * was active during testing/reseeding and later got reset to "todo" by a
 * resize without ever passing through "completed"), and deletes rows whose
 * bracket match is "todo"/"skipped" or gone entirely (resize dropped that
 * round) — those don't correspond to anything current. Any votes against a
 * deleted row are refunded first, since the FK is ON DELETE CASCADE and
 * would otherwise silently drop the vote along with the user's already-
 * deducted tokens.
 *
 * Deliberately does NOT filter out rows with a null bracket_match_id: a row
 * can only get one through this function's own insert below (always set),
 * so a null one is never legitimate — usually a manual test insert via the
 * Supabase dashboard — and should be swept up as stale exactly like any
 * other orphan, not silently left active forever.
 */
async function reconcileVotingMatches(bracketMatchById: Map<string, BracketMatch>): Promise<void> {
  const { data: rows, error } = await supabase
    .from("matches")
    .select("id, bracket_match_id, is_active, voting_open, is_exhibition, left_name, right_name")
    .is("winner_side", null);
  if (error || !rows) return;

  const rowByBracketId = new Map(
    rows.filter(r => r.bracket_match_id !== null).map(r => [r.bracket_match_id as string, r]),
  );
  const toDelete: string[] = [];

  for (const row of rows) {
    const bm = row.bracket_match_id ? bracketMatchById.get(row.bracket_match_id as string) : undefined;
    if (bm?.status !== "active" && bm?.status !== "next") toDelete.push(row.id as string);
  }

  for (const bm of bracketMatchById.values()) {
    if (bm.status !== "active" && bm.status !== "next") continue;
    const desired = {
      comp_type: toDbCategory(bm.division),
      is_active: bm.status === "active",
      // Only active matches can have voting opened; non-active are always closed.
      // Active matches default closed — admin explicitly opens voting.
      voting_open: bm.status === "active" ? (bm.votingOpen ?? false) : false,
      is_exhibition: bm.side === "exhibition",
      left_name: bm.slotA.teamName || "TBD",
      right_name: bm.slotB.teamName || "TBD",
    };
    const existing = rowByBracketId.get(bm.id);
    if (!existing) {
      await supabase.from("matches").insert({ bracket_match_id: bm.id, ...desired });
    } else if (
      existing.is_active !== desired.is_active ||
      existing.voting_open !== desired.voting_open ||
      existing.is_exhibition !== desired.is_exhibition ||
      existing.left_name !== desired.left_name ||
      existing.right_name !== desired.right_name
    ) {
      await supabase.from("matches").update(desired).eq("id", existing.id as string);
    }
  }

  if (toDelete.length === 0) return;

  const { data: voteRows } = await supabase
    .from("votes").select("user_id, amount").in("match_id", toDelete);
  if (voteRows && voteRows.length > 0) {
    const refundByUser = new Map<string, number>();
    for (const v of voteRows) {
      const uid = v.user_id as string;
      refundByUser.set(uid, (refundByUser.get(uid) ?? 0) + (v.amount as number));
    }
    for (const [userId, refund] of refundByUser) {
      const { data: user } = await supabase.from("users").select("tokens").eq("id", userId).single();
      if (user) await supabase.from("users").update({ tokens: (user.tokens as number) + refund }).eq("id", userId);
    }
    console.warn(`[bracket] refunded ${voteRows.length} vote(s) on stale matches before cleanup: ${toDelete.join(", ")}`);
  }
  await supabase.from("matches").delete().in("id", toDelete);
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

  // Voting rows follow the SCHEDULE-derived active/next (one active + one next
  // per ring) rather than the raw stored status — so changing the ring count
  // immediately surfaces the right number of active matches on the public
  // voting page. applyScheduleStatus preserves completed/skipped, so the
  // completed-transition sync below still behaves correctly.
  let effective = matches;
  for (const d of DIVISIONS) {
    effective = applyScheduleStatus(effective, schedules[d], d);
  }

  try {
    await syncCompletedMatches(beforeStatusById, effective);
  } catch (err) {
    console.error("[bracket] voting sync failed:", err);
  }

  try {
    await reconcileVotingMatches(new Map(effective.map(m => [m.id, m])));
  } catch (err) {
    console.error("[bracket] voting reconcile failed:", err);
  }
}
