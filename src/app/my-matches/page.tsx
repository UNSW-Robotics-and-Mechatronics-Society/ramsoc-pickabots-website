import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { findProfileByEmail, getTeamForProfile } from "@/lib/db/profiles";
import { getTeamLedger, getUpcomingMatchesForTeam } from "@/lib/db/teamLedger";
import MyMatchesPage from "@/components/MyMatchesPage";

export const dynamic = "force-dynamic";

// Only reachable from the bottom nav item BottomNav shows to players who are
// linked to a competing team (see TeamStep in onboarding) — a spectator who
// navigates here directly just sees the "not on a team" state below.
export default async function MyMatches() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? "";
  const profile = email ? await findProfileByEmail(email) : null;
  const membership = profile ? await getTeamForProfile(profile.id) : null;

  if (!membership) {
    return (
      <MyMatchesPage
        team={null}
        matches={[]}
        pastMatches={[]}
        wins={0}
        losses={0}
        winRate={0}
        eliminated={null}
      />
    );
  }

  const [matches, ledger] = await Promise.all([
    getUpcomingMatchesForTeam(membership.team.name, membership.team.division),
    getTeamLedger(membership.team.name, membership.team.division),
  ]);

  return (
    <MyMatchesPage
      team={membership.team}
      matches={matches}
      pastMatches={ledger?.pastMatches ?? []}
      wins={ledger?.wins ?? 0}
      losses={ledger?.losses ?? 0}
      winRate={ledger?.winRate ?? 0}
      eliminated={ledger?.eliminated ?? null}
    />
  );
}
