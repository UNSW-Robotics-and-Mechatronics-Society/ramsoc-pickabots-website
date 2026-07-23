import "server-only";
import supabase from "@/lib/supabase";
import { type Division } from "@/lib/mock-data";
import { fromDbCategory } from "./division";

// Admin "Players" roster: every pickabots app user (bettors + competitors),
// enriched with their shared-profile contact details and team membership.

export type Player = {
  id: string; // pickabots Clerk userId
  displayName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  tokens: number;
  onboarded: boolean;
  isSpectator: boolean;
  teamName: string | null;
  teamRole: "captain" | "member" | null;
  division: Division | null;
  extra: Record<string, unknown>;
  createdAt: string | null;
};

export async function listPlayers(): Promise<Player[]> {
  const { data: userRows, error: uErr } = await supabase
    .from("users")
    .select("id, display_name, tokens, onboarded, is_spectator, profile_id, onboarding_extra, created_at");
  if (uErr) throw new Error(`Failed to load players: ${uErr.message}`);

  const users = userRows ?? [];
  const profileIds = users.map((u) => u.profile_id as string | null).filter(Boolean) as string[];

  // Shared profile contact details.
  const profileById = new Map<string, { full_name: string; email: string; phone: string }>();
  if (profileIds.length > 0) {
    const { data: profileRows, error: pErr } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", profileIds);
    if (pErr) throw new Error(`Failed to load profiles: ${pErr.message}`);
    for (const p of profileRows ?? []) {
      profileById.set(p.id as string, {
        full_name: (p.full_name as string) ?? "",
        email: (p.email as string) ?? "",
        phone: (p.phone as string) ?? "",
      });
    }
  }

  // Team membership + team names.
  const membershipByProfile = new Map<string, { teamId: string; role: "captain" | "member" }>();
  if (profileIds.length > 0) {
    const { data: memberRows, error: mErr } = await supabase
      .from("team_members")
      .select("profile_id, team_id, role")
      .in("profile_id", profileIds);
    if (mErr) throw new Error(`Failed to load memberships: ${mErr.message}`);
    for (const m of memberRows ?? []) {
      membershipByProfile.set(m.profile_id as string, {
        teamId: m.team_id as string,
        role: (m.role as "captain" | "member") ?? "member",
      });
    }
  }

  const teamIds = [...new Set([...membershipByProfile.values()].map((m) => m.teamId))];
  const teamById = new Map<string, { name: string; division: Division }>();
  if (teamIds.length > 0) {
    const { data: teamRows, error: tErr } = await supabase
      .from("teams")
      .select("id, name, category")
      .in("id", teamIds);
    if (tErr) throw new Error(`Failed to load teams: ${tErr.message}`);
    for (const t of teamRows ?? []) {
      teamById.set(t.id as string, {
        name: t.name as string,
        division: fromDbCategory(t.category as string),
      });
    }
  }

  return users
    .map<Player>((u) => {
      const profileId = u.profile_id as string | null;
      const profile = profileId ? profileById.get(profileId) : undefined;
      const membership = profileId ? membershipByProfile.get(profileId) : undefined;
      const team = membership ? teamById.get(membership.teamId) : undefined;
      return {
        id: u.id as string,
        displayName: (u.display_name as string | null) ?? null,
        fullName: profile?.full_name || null,
        email: profile?.email || null,
        phone: profile?.phone || null,
        tokens: (u.tokens as number) ?? 0,
        onboarded: Boolean(u.onboarded),
        isSpectator: Boolean(u.is_spectator),
        teamName: team?.name ?? null,
        teamRole: membership?.role ?? null,
        division: team?.division ?? null,
        extra: (u.onboarding_extra as Record<string, unknown>) ?? {},
        createdAt: (u.created_at as string | null) ?? null,
      };
    })
    .sort((a, b) => {
      const an = (a.fullName || a.displayName || a.id).toLowerCase();
      const bn = (b.fullName || b.displayName || b.id).toLowerCase();
      return an.localeCompare(bn);
    });
}

/** Add `amount` tokens to a player (may be negative to deduct). Returns the new balance, clamped at 0. */
export async function boostPlayer(clerkUserId: string, amount: number): Promise<number> {
  const { data, error } = await supabase
    .from("users")
    .select("tokens")
    .eq("id", clerkUserId)
    .limit(1);
  if (error) throw new Error(`Failed to load player: ${error.message}`);
  const current = (data?.[0]?.tokens as number | undefined) ?? 0;
  const next = Math.max(0, current + amount);
  const { error: updErr } = await supabase.from("users").update({ tokens: next }).eq("id", clerkUserId);
  if (updErr) throw new Error(`Failed to boost player: ${updErr.message}`);
  return next;
}

/**
 * Kick a player from pickabots: deletes their pickabots-local `users` row
 * (which cascades to their bets/votes via FK). This does NOT touch the shared
 * `profiles`/`team_members` tables, so their sumobots registration is intact —
 * they'd simply re-onboard if they returned.
 */
export async function kickPlayer(clerkUserId: string): Promise<void> {
  const { error } = await supabase.from("users").delete().eq("id", clerkUserId);
  if (error) throw new Error(`Failed to kick player: ${error.message}`);
}
