import "server-only";
import supabase from "@/lib/supabase";

export type SpecialTeamCategory = "std" | "open" | "boss" | "other";

export type SpecialTeam = {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  category: SpecialTeamCategory;
  present: boolean;
  createdAt: string;
};

export type SpecialTeamInput = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  category: SpecialTeamCategory;
};

export type SpecialTeamPatch = Partial<{
  name: string;
  email: string;
  phone: string;
  notes: string;
  category: SpecialTeamCategory;
  present: boolean;
}>;

const COLUMNS = "id, name, email, phone, notes, category, present, created_at";

function rowToSpecialTeam(t: Record<string, unknown>): SpecialTeam {
  return {
    id: t.id as string,
    name: t.name as string,
    email: (t.email as string | null) ?? "",
    phone: (t.phone as string | null) ?? "",
    notes: (t.notes as string | null) ?? "",
    category: (t.category as SpecialTeamCategory | null) ?? "other",
    present: (t.present as boolean | null) ?? false,
    createdAt: t.created_at as string,
  };
}

export async function listSpecialTeams(): Promise<SpecialTeam[]> {
  const { data, error } = await supabase
    .from("special_teams")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load special teams: ${error.message}`);

  return (data ?? []).map(rowToSpecialTeam);
}

export async function createSpecialTeam(input: SpecialTeamInput): Promise<SpecialTeam> {
  const { data, error } = await supabase
    .from("special_teams")
    .insert(input)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create special team: ${error.message}`);

  return rowToSpecialTeam(data);
}

export async function updateSpecialTeam(id: string, patch: SpecialTeamPatch): Promise<SpecialTeam> {
  const { data, error } = await supabase
    .from("special_teams")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Failed to update special team: ${error.message}`);

  return rowToSpecialTeam(data);
}

export async function deleteSpecialTeam(id: string): Promise<void> {
  const { error } = await supabase.from("special_teams").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete special team: ${error.message}`);
}
