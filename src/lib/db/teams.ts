import "server-only";
import supabase from "@/lib/supabase";
import { type Team } from "@/lib/mock-data";
import { fromDbCategory } from "./division";

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
