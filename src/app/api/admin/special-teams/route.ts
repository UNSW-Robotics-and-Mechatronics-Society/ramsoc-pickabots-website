import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/auth";
import { listSpecialTeams, createSpecialTeam, type SpecialTeamCategory } from "@/lib/db/specialTeams";

const CATEGORIES: SpecialTeamCategory[] = ["std", "open", "boss", "other"];

async function requireAdmin(): Promise<boolean> {
  const user = await currentUser();
  return isAdminUser(user);
}

// GET /api/admin/special-teams — list one-time/exhibition teams
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const teams = await listSpecialTeams();
    return NextResponse.json(teams);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

// POST /api/admin/special-teams — add a one-time/exhibition team
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, email, phone, notes, category } = body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "name is required" }, { status: 400 });

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const cat: SpecialTeamCategory = CATEGORIES.includes(category as SpecialTeamCategory)
    ? (category as SpecialTeamCategory)
    : "other";

  try {
    const team = await createSpecialTeam({
      name: name.trim(),
      email: str(email),
      phone: str(phone),
      notes: str(notes),
      category: cat,
    });
    return NextResponse.json(team, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
