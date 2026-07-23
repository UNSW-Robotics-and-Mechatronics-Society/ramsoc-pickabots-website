import "server-only";
import supabase from "@/lib/supabase";

// Pickabots-local onboarding state, stored on the pickabots `users` row
// (keyed by the pickabots Clerk userId — see migration 0005).

export type PickabotsOnboardingState = {
  onboarded: boolean;
  profileId: string | null;
  isSpectator: boolean;
};

export async function getOnboardingState(
  clerkUserId: string,
): Promise<PickabotsOnboardingState> {
  const { data, error } = await supabase
    .from("users")
    .select("onboarded, profile_id, is_spectator")
    .eq("id", clerkUserId)
    .limit(1);
  if (error) throw new Error(`Failed to load onboarding state: ${error.message}`);
  const row = data?.[0];
  return {
    onboarded: Boolean(row?.onboarded),
    profileId: (row?.profile_id as string | null) ?? null,
    isSpectator: Boolean(row?.is_spectator),
  };
}

/**
 * Mark a pickabots user onboarded and cache their matched shared profile.
 * Upserts the users row (it may not exist yet — the betting flow lazily
 * creates it, but onboarding can run first), preserving tokens on conflict.
 */
export async function completeOnboarding(
  clerkUserId: string,
  opts: { profileId: string | null; isSpectator: boolean; displayName?: string | null },
): Promise<void> {
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("id", clerkUserId)
    .limit(1);

  const patch = {
    onboarded: true,
    profile_id: opts.profileId,
    is_spectator: opts.isSpectator,
  };

  if (existing?.[0]) {
    const { error } = await supabase.from("users").update(patch).eq("id", clerkUserId);
    if (error) throw new Error(`Failed to mark onboarded: ${error.message}`);
  } else {
    const { error } = await supabase.from("users").insert({
      id: clerkUserId,
      tokens: 100,
      display_name: opts.displayName ?? null,
      ...patch,
    });
    if (error) throw new Error(`Failed to create onboarded user: ${error.message}`);
  }
}
