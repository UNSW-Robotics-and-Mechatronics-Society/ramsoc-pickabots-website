// Client-safe SMS template helpers (no "server-only" — imported by both the
// admin editor UI and the server-side notify path so rendering stays identical).

import { type Division } from "@/lib/mock-data";

/** Default venue text for {location} until the admin sets one in Settings. */
export const DEFAULT_SMS_LOCATION = "the arena";

// Default "your team is up next" message. Placeholders {team}, {division},
// {ring} (auto-derived) and {location} (Settings) are substituted at send time.
// Kept short so it stays close to one SMS part.
export const DEFAULT_SMS_UP_NEXT =
  `RAMSOC Pickabots: Team "{team}" you're UP NEXT in {division} on Ring {ring}. Head to {location} and check in with a judge.`;

/** Placeholders the admin can use in the "up next" template, for the editor's help text. */
export const SMS_TEMPLATE_PLACEHOLDERS = ["{team}", "{division}", "{ring}", "{location}"] as const;

export function divisionLabelFor(d: Division): string {
  return d === "standards" ? "Standard" : "Open";
}

/** Substitute {team}/{division}/{ring}/{location}. Unknown placeholders are left as-is;
 *  a missing ring/location renders as an empty string. */
export function renderSmsTemplate(
  template: string,
  vars: { team: string; division: Division; ring?: number | string; location?: string },
): string {
  return template
    .replace(/\{team\}/g, vars.team)
    .replace(/\{division\}/g, divisionLabelFor(vars.division))
    .replace(/\{ring\}/g, vars.ring != null && vars.ring !== "" ? String(vars.ring) : "")
    .replace(/\{location\}/g, vars.location ?? "");
}

// ── Broadcast (send-to-all-captains) placeholders ─────────────────────────────
// A broadcast is rendered PER captain, so it supports the recipient's name too.
// (No {ring} — a broadcast isn't tied to a specific match.)
export const BROADCAST_PLACEHOLDERS = ["{first}", "{captain}", "{team}", "{division}", "{location}"] as const;

export type BroadcastVars = { first: string; captain: string; team: string; division: Division; location?: string };

export function renderBroadcastTemplate(template: string, vars: BroadcastVars): string {
  return template
    .replace(/\{first\}/g, vars.first)
    .replace(/\{captain\}/g, vars.captain)
    .replace(/\{team\}/g, vars.team)
    .replace(/\{division\}/g, divisionLabelFor(vars.division))
    .replace(/\{location\}/g, vars.location ?? "");
}

/** First token of a full name (for {first}); falls back to the whole string. */
export function firstNameOf(fullName: string): string {
  return (fullName.trim().split(/\s+/)[0] || fullName).trim();
}
