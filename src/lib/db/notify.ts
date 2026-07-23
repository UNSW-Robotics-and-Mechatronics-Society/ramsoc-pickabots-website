import "server-only";
import supabase from "@/lib/supabase";
import { getTeamContacts, getTeamById, type TeamContact } from "./profiles";
import { fromDbCategory } from "./division";
import { type Division } from "@/lib/mock-data";

// SMS logging + "your team is up next" captain-alert orchestration.

export type SmsLogEntry = {
  to: string;
  body: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  teamId?: string | null;
  matchId?: string | null;
  kind?: "manual" | "auto_next";
};

/** Best-effort audit log — never throws (a logging failure must not fail a send). */
export async function logSmsResults(entries: SmsLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({
    to_number: e.to,
    body: e.body,
    team_id: e.teamId ?? null,
    match_id: e.matchId ?? null,
    kind: e.kind ?? "manual",
    status: e.status,
    error: e.error ?? null,
  }));
  const { error } = await supabase.from("pickabots_sms_log").insert(rows);
  if (error) console.error("[notify] failed to write sms log:", error.message);
}

export type BracketMatchTeams = {
  id: string;
  division: Division;
  status: string;
  captainNotified: boolean;
  teamAId: string | null;
  teamBId: string | null;
  slotAName: string;
  slotBName: string;
};

/** Load a bracket match with its two resolved team ids (by FK, falling back to name lookup). */
export async function getBracketMatchTeams(matchId: string): Promise<BracketMatchTeams | null> {
  const { data, error } = await supabase
    .from("bracket_matches")
    .select("id, division, status, captain_notified, slot_a_team_id, slot_b_team_id, slot_a_name, slot_b_name")
    .eq("id", matchId)
    .limit(1);
  if (error) throw new Error(`Failed to load match: ${error.message}`);
  const r = data?.[0];
  if (!r) return null;

  let teamAId = (r.slot_a_team_id as string | null) ?? null;
  let teamBId = (r.slot_b_team_id as string | null) ?? null;

  // Fall back to resolving by name if the denormalized FK wasn't populated.
  const unresolved = [
    !teamAId && r.slot_a_name ? (r.slot_a_name as string) : null,
    !teamBId && r.slot_b_name ? (r.slot_b_name as string) : null,
  ].filter(Boolean) as string[];
  if (unresolved.length > 0) {
    const { data: teamRows } = await supabase.from("teams").select("id, name").in("name", unresolved);
    const byName = new Map((teamRows ?? []).map((t) => [t.name as string, t.id as string]));
    if (!teamAId) teamAId = byName.get(r.slot_a_name as string) ?? null;
    if (!teamBId) teamBId = byName.get(r.slot_b_name as string) ?? null;
  }

  return {
    id: r.id as string,
    division: fromDbCategory(r.division as string),
    status: r.status as string,
    captainNotified: Boolean(r.captain_notified),
    teamAId,
    teamBId,
    slotAName: (r.slot_a_name as string) ?? "",
    slotBName: (r.slot_b_name as string) ?? "",
  };
}

export async function setCaptainNotified(matchId: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("bracket_matches")
    .update({ captain_notified: value })
    .eq("id", matchId);
  if (error) console.error("[notify] failed to set captain_notified:", error.message);
}

/** Human label for a division, for message copy. */
export function divisionLabel(d: Division): string {
  return d === "standards" ? "Standard" : "Open";
}

/**
 * "Up next" SMS copy, kept under 160 chars (one message part) so it bills as a
 * single SMS. Recipients see it from the "RAMSOC" sender.
 */
export function upNextMessage(teamName: string, division: Division): string {
  return `RAMSOC Pickabots: Team "${teamName}" you're UP NEXT in ${divisionLabel(division)}. Please head to the arena and check in with a judge.`;
}

export { getTeamContacts, getTeamById, type TeamContact };
