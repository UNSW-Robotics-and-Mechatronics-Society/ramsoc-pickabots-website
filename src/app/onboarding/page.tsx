import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOnboardingState } from "@/lib/db/onboarding";
import {
  findProfileByEmail,
  getTeamForProfile,
  listOnboardingTeams,
  type OnboardingTeam,
  type SharedProfile,
  type TeamRole,
} from "@/lib/db/profiles";
import OnboardingFlow from "./OnboardingFlow";
import OnboardedRedirect from "./_components/OnboardedRedirect";
import { BrandHeader } from "./_components/ui";

type LoadedData = {
  existingProfile: SharedProfile | null;
  detectedTeam: { team: OnboardingTeam; role: TeamRole } | null;
  teams: OnboardingTeam[];
};

export default async function OnboardingPage() {
  const user = await currentUser();
  const userId = user?.id;
  if (!userId) redirect("/sign-in");

  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "";

  // Load onboarding state + registration data. Local DB creds may be
  // misconfigured, so we surface a friendly card instead of crashing the page.
  // NB: the redirect (below) is kept OUT of this try/catch — redirect() works
  // by throwing, and catching it would silently swallow the navigation.
  let onboarded = false;
  let data: LoadedData | null = null;
  let errorMessage: string | null = null;

  try {
    const state = await getOnboardingState(userId);
    onboarded = state.onboarded;

    if (!onboarded) {
      const existingProfile = email ? await findProfileByEmail(email) : null;
      const detectedTeam = existingProfile ? await getTeamForProfile(existingProfile.id) : null;
      const teams = await listOnboardingTeams();
      data = { existingProfile, detectedTeam, teams };
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Something went wrong";
  }

  // Already onboarded: set the gate cookie client-side and hard-navigate to
  // /voting. (Cookies can't be written during a Server Component render.)
  if (onboarded) {
    return <OnboardedRedirect />;
  }

  if (errorMessage || !data) {
    return (
      <div className="flex w-full flex-col items-center gap-8 py-4">
        <BrandHeader subtitle="Competitor Onboarding" />
        <div className="glass w-full rounded-2xl p-6 text-center">
          <h2 className="mb-2 text-xl">We hit a snag</h2>
          <p className="text-sm text-foreground/60">
            We couldn&apos;t load onboarding right now. Please refresh and try again in a moment.
          </p>
          {errorMessage && (
            <p className="mt-3 break-words text-xs text-red-400/80">{errorMessage}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <OnboardingFlow
      email={email}
      existingProfile={data.existingProfile}
      detectedTeam={data.detectedTeam}
      teams={data.teams}
    />
  );
}
