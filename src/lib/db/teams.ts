import "server-only";
import supabase from "@/lib/supabase";
import { type Team } from "@/lib/mock-data";
import { fromDbCategory } from "./division";

type TeamStatePatch = Partial<{
  seed: number | null;
  points: number;
  comment: string;
  present: boolean;
  wildcard: boolean;
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
      wildcard: s?.wildcard ?? false,
    };
  });
}

export async function updateTeamState(teamId: string, patch: TeamStatePatch): Promise<void> {
  const { error } = await supabase
    .from("pickabots_team_state")
    .upsert({ team_id: teamId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  if (error) throw new Error(`Failed to update team state: ${error.message}`);
}
