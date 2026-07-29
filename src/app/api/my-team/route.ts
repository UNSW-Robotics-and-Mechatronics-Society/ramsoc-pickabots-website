import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { findProfileByEmail, getTeamForProfile } from "@/lib/db/profiles";
import { getTeamLedger, getUpcomingMatchesForTeam } from "@/lib/db/teamLedger";

// GET /api/my-team — the signed-in player's linked team (if any, set during
// onboarding — see OnboardingFlow/TeamStep) and its upcoming match times.
// `team: null` covers both "not onboarded yet" and "onboarded as spectator".
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress ?? "";
  if (!email) return NextResponse.json({ team: null, matches: [] });

  try {
    const profile = await findProfileByEmail(email);
    const membership = profile ? await getTeamForProfile(profile.id) : null;
    if (!membership) return NextResponse.json({ team: null, matches: [] });

    const [matches, ledger] = await Promise.all([
      getUpcomingMatchesForTeam(membership.team.name, membership.team.division),
      getTeamLedger(membership.team.name, membership.team.division),
    ]);
    return NextResponse.json({
      team: membership.team,
      matches,
      pastMatches: ledger?.pastMatches ?? [],
      wins: ledger?.wins ?? 0,
      losses: ledger?.losses ?? 0,
      winRate: ledger?.winRate ?? 0,
      eliminated: ledger?.eliminated ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load team" },
      { status: 500 },
    );
  }
}
