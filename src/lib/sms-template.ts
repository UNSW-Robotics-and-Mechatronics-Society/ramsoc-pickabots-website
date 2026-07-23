// Client-safe SMS template helpers (no "server-only" — imported by both the
// admin editor UI and the server-side notify path so rendering stays identical).

import { type Division } from "@/lib/mock-data";

// Default "your team is up next" message. Placeholders {team} and {division}
// are substituted at send time. Kept ≤160 chars so it bills as one SMS part.
export const DEFAULT_SMS_UP_NEXT =
  `RAMSOC Pickabots: Team "{team}" you're UP NEXT in {division}. Please head to the arena and check in with a judge.`;

/** Placeholders the admin can use in the template, for the editor's help text. */
export const SMS_TEMPLATE_PLACEHOLDERS = ["{team}", "{division}"] as const;

export function divisionLabelFor(d: Division): string {
  return d === "standards" ? "Standard" : "Open";
}

/** Substitute {team} / {division} into a template. Unknown placeholders are left as-is. */
export function renderSmsTemplate(
  template: string,
  vars: { team: string; division: Division },
): string {
  return template
    .replace(/\{team\}/g, vars.team)
    .replace(/\{division\}/g, divisionLabelFor(vars.division));
}

// ── Broadcast (send-to-all-captains) placeholders ─────────────────────────────
// A broadcast is rendered PER captain, so it supports the recipient's name too.
export const BROADCAST_PLACEHOLDERS = ["{first}", "{captain}", "{team}", "{division}"] as const;

export type BroadcastVars = { first: string; captain: string; team: string; division: Division };

export function renderBroadcastTemplate(template: string, vars: BroadcastVars): string {
  return template
    .replace(/\{first\}/g, vars.first)
    .replace(/\{captain\}/g, vars.captain)
    .replace(/\{team\}/g, vars.team)
    .replace(/\{division\}/g, divisionLabelFor(vars.division));
}

/** First token of a full name (for {first}); falls back to the whole string. */
export function firstNameOf(fullName: string): string {
  return (fullName.trim().split(/\s+/)[0] || fullName).trim();
}
