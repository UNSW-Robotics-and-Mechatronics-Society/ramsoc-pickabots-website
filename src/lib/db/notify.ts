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

export { divisionLabelFor as divisionLabel } from "@/lib/sms-template";
import { getSmsUpNextTemplate, getSmsLocation } from "./config";
import { renderSmsTemplate } from "@/lib/sms-template";

/**
 * "Up next" SMS copy, rendered from the admin-configured template (falls back
 * to the built-in default). Recipients see it from the "RAMSOC" sender.
 */
export async function upNextMessage(teamName: string, division: Division): Promise<string> {
  const template = await getSmsUpNextTemplate();
  return renderSmsTemplate(template, { team: teamName, division });
}

// ── Shared captain-alert send (used by the auto trigger + the manual route) ────
import { sendManySms, type SmsMessage } from "@/lib/sms";

export type CaptainNotifyResult = {
  matchId: string;
  sent: number;
  skipped?: boolean;
  reason?: string;
};

/**
 * Text both teams' captains that their match is coming up, using the configured
 * template. Idempotent via bracket_matches.captain_notified unless `force`.
 */
export async function notifyCaptainsForMatch(
  matchId: string,
  opts: { force?: boolean; ring?: number } = {},
): Promise<CaptainNotifyResult> {
  const m = await getBracketMatchTeams(matchId);
  if (!m) return { matchId, sent: 0, skipped: true, reason: "not found" };
  if (!opts.force && m.captainNotified) return { matchId, sent: 0, skipped: true, reason: "already notified" };

  const [template, location] = await Promise.all([getSmsUpNextTemplate(), getSmsLocation()]);
  const slots = [
    { teamId: m.teamAId, fallbackName: m.slotAName },
    { teamId: m.teamBId, fallbackName: m.slotBName },
  ];

  const messages: SmsMessage[] = [];
  const messageTeamIds: (string | null)[] = [];
  for (const slot of slots) {
    if (!slot.teamId) continue;
    const [contacts, team] = await Promise.all([getTeamContacts(slot.teamId), getTeamById(slot.teamId)]);
    const teamName = team?.name ?? slot.fallbackName;
    for (const captain of contacts.filter(c => c.role === "captain" && c.phone)) {
      messages.push({ to: captain.phone, body: renderSmsTemplate(template, { team: teamName, division: m.division, ring: opts.ring, location }) });
      messageTeamIds.push(slot.teamId);
    }
  }

  if (messages.length === 0) {
    await setCaptainNotified(matchId, true);
    return { matchId, sent: 0, reason: "no captain phone numbers" };
  }

  const results = await sendManySms(messages);
  await logSmsResults(
    results.map((r, i) => ({
      to: r.to,
      body: messages[i].body,
      status: r.status,
      error: r.error,
      teamId: messageTeamIds[i],
      matchId,
      kind: "auto_next",
    })),
  );
  await setCaptainNotified(matchId, true);
  return { matchId, sent: results.filter(r => r.ok).length };
}

export { getTeamContacts, getTeamById, type TeamContact };
