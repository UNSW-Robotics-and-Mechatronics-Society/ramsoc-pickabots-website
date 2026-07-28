import "server-only";
import supabase from "@/lib/supabase";
import { type Team } from "@/lib/mock-data";
import { type SeedConflict, type SeedHolder, computeSeedConflicts } from "@/lib/seeds";
import { fromDbCategory } from "./division";

export type { SeedConflict };

type TeamStatePatch = Partial<{
  seed: number | null;
  points: number;
  comment: string;
  present: boolean;
  in_bracket: boolean | null;
}>;

export async function listTeams(): Promise<Team[]> {
  const [{ data: teamRows, error: teamsErr }, { data: stateRows, error: stateErr }] = await Promise.all([
    supabase.from("teams").select("id, name, category"),
    supabase.from("pickabots_team_state").select("*"),
  ]);
  if (teamsErr) throw new Error(`Failed to load teams: ${teamsErr.message}`);
  if (stateErr) throw new Error(`Failed to load team state: ${stateErr.message}`);

  const stateById = new Map((stateRows ?? []).map(s => [s.team_id as string, s]));

  return (teamRows ?? []).map((t): Team => {
    const s = stateById.get(t.id as string);
    return {
      id: t.id as string,
      name: t.name as string,
      division: fromDbCategory(t.category as string),
      points: s?.points ?? 0,
      seed: s?.seed ?? null,
      comment: s?.comment ?? "",
      present: s?.present ?? false,
      // null when unset (no state row or explicitly null) → "auto" (see Team.inBracket)
      inBracket: (s?.in_bracket ?? null) as boolean | null,
    };
  });
}

/**
 * The authoritative seed-uniqueness check: what seeds would each division hold
 * if `assignments` were applied?
 *
 * Read fresh from the database every call, which is the whole point. The admin
 * page loads its team list once and polls it only every 20s, so two admins can
 * each assign the same seed to different teams and both pass their own local
 * check. This is the only place that sees the real current state.
 */
export async function findSeedConflicts(
  assignments: { teamId: string; seed: number | null }[],
): Promise<SeedConflict[]> {
  if (assignments.length === 0) return [];

  const [{ data: teamRows, error: teamsErr }, { data: stateRows, error: stateErr }] = await Promise.all([
    supabase.from("teams").select("id, name, category"),
    supabase.from("pickabots_team_state").select("team_id, seed"),
  ]);
  if (teamsErr) throw new Error(`Failed to load teams: ${teamsErr.message}`);
  if (stateErr) throw new Error(`Failed to load team state: ${stateErr.message}`);

  const seedByTeamId = new Map((stateRows ?? []).map(s => [s.team_id as string, s.seed as number | null]));
  const assignedById = new Map(assignments.map(a => [a.teamId, a.seed]));

  const holders: SeedHolder[] = (teamRows ?? []).map(t => {
    const id = t.id as string;
    return {
      id,
      name: t.name as string,
      division: fromDbCategory(t.category as string),
      seed: assignedById.has(id) ? assignedById.get(id)! : (seedByTeamId.get(id) ?? null),
    };
  });

  // Scoped to the teams being assigned, so a duplicate already in the table
  // can't block an unrelated edit to some other team.
  return computeSeedConflicts(holders, new Set(assignments.map(a => a.teamId)));
}

export async function updateTeamState(teamId: string, patch: TeamStatePatch): Promise<void> {
  const { error } = await supabase
    .from("pickabots_team_state")
    .upsert({ team_id: teamId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) throw new Error(`Failed to update team state: ${error.message}`);
}

/**
 * Applies the SAME patch to many teams in one upsert — used by the admin
 * "set all present/absent" and "set all in/out" bulk actions, and by seed
 * import. Every row must carry the same columns (PostgREST bulk-upsert
 * requirement), so callers pass one uniform patch across all ids.
 */
export async function bulkUpdateTeamState(teamIds: string[], patch: TeamStatePatch): Promise<void> {
  if (teamIds.length === 0) return;
  const now = new Date().toISOString();
  const rows = teamIds.map(team_id => ({ team_id, ...patch, updated_at: now }));
  const { error } = await supabase
    .from("pickabots_team_state")
    .upsert(rows, { onConflict: "team_id" });
  if (error) throw new Error(`Failed to bulk-update team state: ${error.message}`);
}

/**
 * Imports one seed per team (each a distinct value, so this can't share the
 * single-patch bulk helper). Runs the per-row upserts concurrently.
 */
export async function bulkSetSeeds(seeds: { teamId: string; seed: number }[]): Promise<void> {
  if (seeds.length === 0) return;
  const now = new Date().toISOString();
  const rows = seeds.map(({ teamId, seed }) => ({ team_id: teamId, seed, updated_at: now }));
  const { error } = await supabase
    .from("pickabots_team_state")
    .upsert(rows, { onConflict: "team_id" });
  if (error) throw new Error(`Failed to import seeds: ${error.message}`);
}
