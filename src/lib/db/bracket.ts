import "server-only";
import { unstable_cache } from "next/cache";
import supabase from "@/lib/supabase";
import {
  type BracketMatch, type BracketSide, type Division, type MatchStatus, type TeamCount,
  generateDoubleElimBracket, winner,
} from "@/lib/mock-data";
import {
  type MatchSchedule, type ExhibitionSchedule,
  DEFAULT_MATCH_MINUTES, DEFAULT_GAP_MINUTES,
  generateSchedule, applyScheduleStatus, rollSchedule, rollExhibitionSchedule, dueForNotify,
} from "@/lib/schedule";
import { toDbCategory, fromDbCategory } from "./division";
import { rewardWinners } from "./rewards";
import { notifyCaptainsForMatch } from "./notify";
import { getNotifyLead, getAutoSmsEnabled } from "./config";

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
  // Shared across both divisions — not one copy per division. See
  // ExhibitionSchedule.
  exhibitionSchedule: ExhibitionSchedule;
};

// The exhibition schedule has no dedicated table — it's persisted by
// embedding an identical copy into BOTH divisions' bracket_schedule rows
// (under a `schedule.exhibition` key) rather than adding new schema.
type StoredSchedule = {
  exhibition?: ExhibitionSchedule;
  exhibitionRings?: ExhibitionSchedule["rings"];
};

function extractExhibitionSchedule(scheduleRows: { schedule: unknown }[]): ExhibitionSchedule {
  const raw = scheduleRows.map(r => r.schedule as StoredSchedule);

  // New shape: an IDENTICAL mirrored copy lives on every row — take the
  // first one found, don't accumulate (they're duplicates of the same data,
  // not distinct pieces; concatenating would double every ring).
  const mirrored = raw.find(r => r.exhibition)?.exhibition;
  if (mirrored) return mirrored;

  // Legacy shape (before this was unified): each row had its OWN distinct
  // per-division exhibitionRings — concatenate every row's list exactly
  // once so nothing is dropped during the one-time migration to the shared
  // model (the very first save after this rewrites it into the new shape).
  const legacyRingLists = raw.map(r => r.exhibitionRings).filter((r): r is ExhibitionSchedule["rings"] => !!r);
  return { rings: legacyRingLists.flat(), matchMinutes: DEFAULT_MATCH_MINUTES, gapMinutes: DEFAULT_GAP_MINUTES };
}

async function computeBracketState(): Promise<BracketState> {
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

  const exhibitionSchedule = rollExhibitionSchedule(extractExhibitionSchedule(scheduleRows ?? []), matches);

  return { matches, teamCount, schedules, exhibitionSchedule };
}

// Public reads — the competition/matches pages and the team-ledger modal — go
// through the cache so a crowd loading them shares one computation (and one run
// of the per-request bracket generation/schedule-roll CPU) instead of each
// triggering three queries. Invalidated by revalidateTag('bracket') on save
// (see app/api/admin/bracket/route.ts). The revalidate keeps the read-time
// schedule roll (rollSchedule) fresh; 30s is well finer than its minute-level
// granularity.
export const getBracketState = unstable_cache(computeBracketState, ["bracket-state"], {
  revalidate: 30,
  tags: ["bracket"],
});

// Uncached: the admin editor must always load the authoritative current state,
// never a cached snapshot it might then overwrite.
export { computeBracketState as getBracketStateFresh };

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

/**
 * One bracket write. Every field is optional so an ordinary edit sends only the
 * match rows it actually touched — that's what lets several admins work on the
 * page at once without overwriting each other (see AdminPageClient's dirty-set
 * save). Whole-bracket operations set `replaceAll`.
 */
export type BracketSave = {
  /** Match rows to upsert. Omitted → no match row is touched. */
  matches?: BracketMatch[];
  /**
   * Delete every match row NOT present in `matches`. ONLY for operations that
   * genuinely replace a bracket (auto-fill, resize, reset all) — on a normal
   * per-match save it would delete everything the sender didn't happen to be
   * editing, including other admins' work.
   */
  replaceAll?: boolean;
  teamCount?: TeamCount;
  /** Both divisions at once — a schedule is one JSON blob per division. */
  schedules?: Record<Division, MatchSchedule>;
  exhibitionSchedule?: ExhibitionSchedule;
  /**
   * Divisions whose per-match captain_notified flags should be reset. Sent by
   * auto-fill and reset-all: the flag dedupes the "up next" SMS per match, so
   * without clearing it the NEW occupants of an already-notified match would
   * never be texted.
   */
  clearCaptainNotified?: Division[];
};

export async function saveBracketState(save: BracketSave): Promise<void> {
  const { matches, replaceAll = false, teamCount, schedules, clearCaptainNotified } = save;

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
  if (matches && replaceAll) {
    const newIds = new Set(matches.map(m => m.id));
    const staleIds = (existingRows ?? []).map(r => r.id as string).filter(id => !newIds.has(id));
    if (staleIds.length > 0) {
      const { error } = await supabase.from("bracket_matches").delete().in("id", staleIds);
      if (error) throw new Error(`Failed to delete stale bracket_matches: ${error.message}`);
    }
  }

  if (matches && matches.length > 0) {
    const rows = matches.map(m => matchToRow(m, teamIdByName));
    const { error: upsertErr } = await supabase.from("bracket_matches").upsert(rows, { onConflict: "id" });
    if (upsertErr) throw new Error(`Failed to save bracket_matches: ${upsertErr.message}`);
  }

  // After the upsert: matchToRow deliberately omits captain_notified (so an
  // ordinary save preserves it), which means clearing has to be its own write.
  if (clearCaptainNotified && clearCaptainNotified.length > 0) {
    const { error } = await supabase
      .from("bracket_matches")
      .update({ captain_notified: false })
      .in("division", clearCaptainNotified.map(toDbCategory));
    if (error) throw new Error(`Failed to clear captain_notified: ${error.message}`);
  }

  if (teamCount !== undefined) {
    const { error: configErr } = await supabase
      .from("bracket_config")
      .upsert(DIVISIONS.map(d => ({ division: toDbCategory(d), team_count: teamCount })), { onConflict: "division" });
    if (configErr) throw new Error(`Failed to save bracket_config: ${configErr.message}`);
  }

  if (schedules) {
    // The shared exhibition schedule has no table of its own — an identical
    // copy is embedded in BOTH divisions' rows (see extractExhibitionSchedule),
    // so either row can be read back as the source of truth. Built explicitly
    // (not spread from the in-memory schedule object) so a stale legacy
    // `exhibitionRings` key — carried through from a pre-migration row via
    // rollSchedule's `{ ...schedule, ... }` spread — never gets written back.
    //
    // A caller that sends schedules without the exhibition copy would blank it,
    // so fall back to whatever is already stored rather than writing undefined.
    let exhibitionSchedule = save.exhibitionSchedule;
    if (!exhibitionSchedule) {
      const { data: scheduleRows } = await supabase.from("bracket_schedule").select("schedule");
      exhibitionSchedule = extractExhibitionSchedule(scheduleRows ?? []);
    }

    const { error: schedErr } = await supabase
      .from("bracket_schedule")
      .upsert(
        DIVISIONS.map(d => ({
          division: toDbCategory(d),
          schedule: {
            rings: schedules[d].rings,
            concurrentRings: schedules[d].concurrentRings,
            matchMinutes: schedules[d].matchMinutes,
            gapMinutes: schedules[d].gapMinutes,
            // Round 1 layout of the last Auto Fill — without it a reload would
            // re-derive the play order from the default (middle-first) ordering.
            autoFillMode: schedules[d].autoFillMode ?? 'worst-plays-best',
            exhibition: exhibitionSchedule,
          },
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "division" },
      );
    if (schedErr) throw new Error(`Failed to save bracket_schedule: ${schedErr.message}`);
  }

  // Reconcile against the state now actually IN the database, not the caller's
  // view of it. With partial saves the sender only ever holds part of the
  // picture (and may be one of several admins editing), so re-reading is the
  // only way the voting-row reconciliation and captain alerts below see the
  // whole bracket.
  const fresh = await computeBracketState();

  // Voting rows follow the SCHEDULE-derived active/next (one active + one next
  // per ring) rather than the raw stored status — so changing the ring count
  // immediately surfaces the right number of active matches on the public
  // voting page. applyScheduleStatus preserves completed/skipped, so the
  // completed-transition sync below still behaves correctly. Exhibition
  // matches are exempt (see applyScheduleStatus) — their status is entirely
  // admin-controlled via the dropdown, same as their team names/scores, so
  // `matches`' own status already reflects the admin's choice with no
  // derivation needed.
  let effective = fresh.matches;
  for (const d of DIVISIONS) {
    effective = applyScheduleStatus(effective, fresh.schedules[d], d);
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

  // Lead-time captain alerts: text captains once their team is within
  // `notifyLead` matches of playing. Deduped per match via captain_notified, so
  // running on every save is safe. Best-effort — never fails the bracket save.
  // Gated on the "auto captain texts" toggle so repeated saves during dev/
  // testing don't spam real captains; the manual "up next" button bypasses
  // this (it calls notifyCaptainsForMatch directly, not through here).
  try {
    const lead = await getNotifyLead();
    const dueIds = new Set<string>();
    for (const d of DIVISIONS) {
      for (const id of dueForNotify(effective, fresh.schedules[d], lead)) dueIds.add(id);
    }
    for (const id of dueIds) {
      await notifyCaptainsForMatch(id).catch(err =>
        console.error("[bracket] captain notify failed for", id, err),
      );
    if (await getAutoSmsEnabled()) {
      const lead = await getNotifyLead();
      const dueIds = new Set<string>();
      for (const d of DIVISIONS) {
        for (const id of dueForNotify(effective, schedules[d], lead)) dueIds.add(id);
      }
      for (const id of dueIds) {
        await notifyCaptainsForMatch(id).catch(err =>
          console.error("[bracket] captain notify failed for", id, err),
        );
      }
    }
  } catch (err) {
    console.error("[bracket] captain-notify pass failed:", err);
  }
}
