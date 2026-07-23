"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import {
  createSharedProfile,
  ensureTeamMembership,
  findProfileByEmail,
  type ProfileInput,
} from "@/lib/db/profiles";
import { completeOnboarding } from "@/lib/db/onboarding";

export type SubmitInput = {
  profileInput: ProfileInput | null; // null when an existing profile was matched
  teamId: string | null; // null => spectator
  // Answers to pickabots-specific config-driven questions (see extraFields.ts).
  extra?: Record<string, string | boolean>;
};

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitOnboarding(input: SubmitInput): Promise<SubmitResult> {
  try {
    const { userId } = await auth();
    if (!userId) return { ok: false, error: "Not signed in" };

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
    if (!email) return { ok: false, error: "No email on account" };

    // Prefer an existing (sumobots-created) profile matched by email; otherwise
    // create one from the collected details.
    const existing = await findProfileByEmail(email);
    let profileId: string;
    let displayName: string | null = null;

    if (existing) {
      profileId = existing.id;
      displayName = existing.full_name;
    } else if (input.profileInput) {
      profileId = await createSharedProfile(userId, email, input.profileInput);
      displayName = input.profileInput.full_name.trim() || null;
    } else {
      return { ok: false, error: "Missing details" };
    }

    let isSpectator: boolean;
    if (input.teamId) {
      await ensureTeamMembership(profileId, input.teamId);
      isSpectator = false;
    } else {
      isSpectator = true;
    }

    await completeOnboarding(userId, { profileId, isSpectator, displayName, extra: input.extra });

    const cookieStore = await cookies();
    cookieStore.set("pickabots_onboarded", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return { ok: false, error: message };
  }
}
