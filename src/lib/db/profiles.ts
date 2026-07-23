import "server-only";
import supabase from "@/lib/supabase";
import { type Division } from "@/lib/mock-data";
import { fromDbCategory, toDbCategory, type DbCategory } from "./division";

// ─────────────────────────────────────────────────────────────────────────
//  Shared `profiles` / `teams` / `team_members` access (owned by sumobots).
//
//  The two apps use SEPARATE Clerk instances, so a pickabots clerk_user_id
//  never matches the clerk_user_id sumobots stored. `profiles.email` is the
//  only stable bridge — always resolve a pickabots user to their sumobots
//  registration by (case-insensitive) email.
// ─────────────────────────────────────────────────────────────────────────

export const COMPETITION_YEAR = 2026;

export type TeamRole = "captain" | "member";

export type SharedProfile = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
};

export type OnboardingTeam = {
  id: string;
  name: string;
  division: Division;
};

export type TeamContact = {
  profileId: string;
  fullName: string;
  phone: string;
  role: TeamRole;
};

/** All shared profile fields we let pickabots onboarding create (mirrors sumobots). */
export type ProfileInput = {
  full_name: string;
  user_type: "unsw" | "other_uni" | "high_school";
  university: string;
  zid: string;
  uni_id: string;
  high_school: string;
  year_of_study: string;
  degree_stage: string;
  undergrad_postgrad: string;
  domestic_international: string;
  degree: string;
  majors: string;
  faculty: string;
  gender: string;
  gender_other: string;
  is_ramsoc_member: boolean;
  is_arc_member: boolean;
  heard_from: string;
  heard_from_other: string;
  phone: string;
};

/** Find the sumobots profile for a Clerk email. Case-insensitive; first match wins. */
export async function findProfileByEmail(email: string): Promise<SharedProfile | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone")
    .ilike("email", trimmed)
    .limit(1);
  if (error) throw new Error(`Failed to look up profile: ${error.message}`);
  return (data?.[0] as SharedProfile | undefined) ?? null;
}

/** The team (if any) a profile belongs to, plus that profile's role on it. */
export async function getTeamForProfile(
  profileId: string,
): Promise<{ team: OnboardingTeam; role: TeamRole } | null> {
  const { data: memberRows, error: mErr } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("profile_id", profileId);
  if (mErr) throw new Error(`Failed to load membership: ${mErr.message}`);

  const membership = (memberRows ?? [])[0];
  if (!membership) return null;

  const { data: teamRows, error: tErr } = await supabase
    .from("teams")
    .select("id, name, category")
    .eq("id", membership.team_id as string)
    .limit(1);
  if (tErr) throw new Error(`Failed to load team: ${tErr.message}`);

  const t = teamRows?.[0];
  if (!t) return null;
  return {
    team: { id: t.id as string, name: t.name as string, division: fromDbCategory(t.category as string) },
    role: (membership.role as TeamRole) ?? "member",
  };
}

/** All teams for the current competition year, for the onboarding "pick your team" dropdown. */
export async function listOnboardingTeams(): Promise<OnboardingTeam[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, category")
    .eq("competition_year", COMPETITION_YEAR)
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to load teams: ${error.message}`);
  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    division: fromDbCategory(t.category as string),
  }));
}

/** Members of a team with their contact details — used by the judge/admin SMS UI. */
export async function getTeamContacts(teamId: string): Promise<TeamContact[]> {
  const { data: memberRows, error: mErr } = await supabase
    .from("team_members")
    .select("profile_id, role")
    .eq("team_id", teamId);
  if (mErr) throw new Error(`Failed to load team members: ${mErr.message}`);

  const rows = memberRows ?? [];
  if (rows.length === 0) return [];

  const profileIds = rows.map((r) => r.profile_id as string);
  const { data: profileRows, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", profileIds);
  if (pErr) throw new Error(`Failed to load member profiles: ${pErr.message}`);

  const byId = new Map((profileRows ?? []).map((p) => [p.id as string, p]));
  return rows
    .map<TeamContact>((r) => {
      const p = byId.get(r.profile_id as string);
      return {
        profileId: r.profile_id as string,
        fullName: (p?.full_name as string) ?? "Unknown",
        phone: (p?.phone as string) ?? "",
        role: (r.role as TeamRole) ?? "member",
      };
    })
    // Captains first, then alphabetical.
    .sort((a, b) =>
      a.role !== b.role ? (a.role === "captain" ? -1 : 1) : a.fullName.localeCompare(b.fullName),
    );
}

/** Every team captain (for the current competition year) with contact details —
 *  for the admin "broadcast to all captains" tool. */
export async function getAllCaptainContacts(): Promise<
  { teamId: string; teamName: string; division: Division; fullName: string; phone: string }[]
> {
  // Teams for this year.
  const { data: teamRows, error: tErr } = await supabase
    .from("teams")
    .select("id, name, category")
    .eq("competition_year", COMPETITION_YEAR);
  if (tErr) throw new Error(`Failed to load teams: ${tErr.message}`);
  const teamById = new Map(
    (teamRows ?? []).map(t => [
      t.id as string,
      { name: t.name as string, division: fromDbCategory(t.category as string) },
    ]),
  );
  if (teamById.size === 0) return [];

  // Captains on those teams.
  const { data: memberRows, error: mErr } = await supabase
    .from("team_members")
    .select("profile_id, team_id, role")
    .eq("role", "captain")
    .in("team_id", [...teamById.keys()]);
  if (mErr) throw new Error(`Failed to load captains: ${mErr.message}`);
  const captains = memberRows ?? [];
  if (captains.length === 0) return [];

  const { data: profileRows, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", captains.map(c => c.profile_id as string));
  if (pErr) throw new Error(`Failed to load captain profiles: ${pErr.message}`);
  const profileById = new Map((profileRows ?? []).map(p => [p.id as string, p]));

  return captains
    .map(c => {
      const p = profileById.get(c.profile_id as string);
      const team = teamById.get(c.team_id as string);
      return {
        teamId: c.team_id as string,
        teamName: team?.name ?? "",
        division: team?.division ?? "open",
        fullName: (p?.full_name as string) ?? "Unknown",
        phone: (p?.phone as string) ?? "",
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}

/** Look up a team's row (id, name, division) by its uuid. */
export async function getTeamById(teamId: string): Promise<OnboardingTeam | null> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, category")
    .eq("id", teamId)
    .limit(1);
  if (error) throw new Error(`Failed to load team: ${error.message}`);
  const t = data?.[0];
  return t
    ? { id: t.id as string, name: t.name as string, division: fromDbCategory(t.category as string) }
    : null;
}

/**
 * Create a shared sumobots profile for a pickabots user who hasn't registered.
 * Mirrors sumobots `createProfile` insert exactly (same columns/derivations) so
 * both apps read consistent data. Returns the new profile id.
 */
export async function createSharedProfile(
  clerkUserId: string,
  email: string,
  input: ProfileInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      clerk_user_id: clerkUserId,
      email,
      full_name: input.full_name.trim(),
      user_type: input.user_type,
      is_unsw: input.user_type === "unsw",
      university:
        input.user_type === "unsw"
          ? "UNSW"
          : input.user_type === "other_uni"
            ? input.university.trim()
            : "",
      zid: input.user_type === "unsw" ? input.zid.trim() : "",
      uni_id: input.user_type === "other_uni" ? input.uni_id.trim() : "",
      high_school: input.user_type === "high_school" ? input.high_school.trim() : "",
      year_of_study: input.year_of_study,
      degree_stage: input.degree_stage,
      undergrad_postgrad: input.undergrad_postgrad,
      domestic_international: input.domestic_international,
      degree: input.degree.trim(),
      majors: input.majors.trim(),
      faculty: input.faculty.trim(),
      gender: input.gender,
      gender_other: input.gender === "other" ? input.gender_other.trim() : "",
      is_ramsoc_member: input.is_ramsoc_member,
      is_arc_member: input.is_arc_member,
      heard_from: input.heard_from,
      heard_from_other: input.heard_from === "other" ? input.heard_from_other.trim() : "",
      phone: input.phone.trim(),
      onboarded: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create profile: ${error.message}`);
  return data!.id as string;
}

/**
 * Ensure a `team_members` row links this profile to this team. Idempotent, and
 * never demotes an existing captain to member (a captain re-confirming their
 * team in pickabots onboarding must stay captain).
 */
export async function ensureTeamMembership(profileId: string, teamId: string): Promise<void> {
  const { data: existing, error: exErr } = await supabase
    .from("team_members")
    .select("id, role")
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .limit(1);
  if (exErr) throw new Error(`Failed to check membership: ${exErr.message}`);
  if (existing?.[0]) return; // already on the team — keep their existing role

  const { error } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, profile_id: profileId, role: "member" });
  if (error) throw new Error(`Failed to join team: ${error.message}`);
}

/** Remove a profile from any team they were auto/previously placed on (spectator switch). */
export async function clearTeamMembership(profileId: string): Promise<void> {
  const { error } = await supabase.from("team_members").delete().eq("profile_id", profileId);
  if (error) throw new Error(`Failed to clear membership: ${error.message}`);
}

export type { DbCategory };
export { toDbCategory };
