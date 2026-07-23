"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { OnboardingTeam, ProfileInput, SharedProfile, TeamRole } from "@/lib/db/profiles";
import { submitOnboarding } from "./actions";
import UserTypeStep, { type UserType } from "./_components/UserTypeStep";
import DetailsForm from "./_components/DetailsForm";
import TeamStep from "./_components/TeamStep";
import ExtraFieldsStep from "./_components/ExtraFieldsStep";
import { EXTRA_FIELDS, defaultExtraAnswers, type ExtraAnswers } from "./_components/extraFields";
import { BrandHeader, PrimaryButton } from "./_components/ui";

type Phase = "welcome" | "userType" | "details" | "extras" | "team";

export default function OnboardingFlow({
  email,
  existingProfile,
  detectedTeam,
  teams,
}: {
  email: string;
  existingProfile: SharedProfile | null;
  detectedTeam: { team: OnboardingTeam; role: TeamRole } | null;
  teams: OnboardingTeam[];
}) {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [userType, setUserType] = useState<UserType | null>(null);
  const [profileInput, setProfileInput] = useState<ProfileInput | null>(null);
  const [extraAnswers, setExtraAnswers] = useState<ExtraAnswers>(defaultExtraAnswers());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasExtras = EXTRA_FIELDS.length > 0;

  // Steps shown in the progress dots (welcome is excluded).
  const steps: Phase[] = existingProfile
    ? hasExtras
      ? ["extras", "team"]
      : ["team"]
    : hasExtras
      ? ["userType", "details", "extras", "team"]
      : ["userType", "details", "team"];
  const stepIndex = steps.indexOf(phase);

  async function handleTeamSubmit(teamId: string | null) {
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitOnboarding({
      // When an existing profile matched the email the action resolves it
      // server-side, so we don't need to send the collected input.
      profileInput: existingProfile ? null : profileInput,
      teamId,
      extra: hasExtras ? extraAnswers : undefined,
    });
    if (result.ok) {
      // Full navigation so the proxy re-reads the freshly-set gate cookie.
      window.location.href = "/voting";
      return;
    }
    setSubmitting(false);
    setSubmitError(result.error);
  }

  return (
    <div className="flex w-full flex-col gap-8 py-4">
      <BrandHeader subtitle="Competitor Onboarding" />

      {stepIndex >= 0 && steps.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === stepIndex ? "w-6 bg-[#FF6B00]" : i < stepIndex ? "w-1.5 bg-[#FF6B00]/60" : "w-1.5 bg-white/20",
              )}
            />
          ))}
        </div>
      )}

      <div className="glass rounded-2xl p-5 sm:p-6">
        {phase === "welcome" && (
          <div className="flex flex-col items-center gap-6 py-2 text-center">
            {existingProfile ? (
              <>
                <h1 className="text-2xl">Welcome back, {existingProfile.full_name.split(" ")[0]}</h1>
                <p className="text-sm text-foreground/60">
                  We found your registration for {existingProfile.email}. Let&apos;s confirm your
                  team and get you into the action.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl">Let&apos;s get you set up</h1>
                <p className="text-sm text-foreground/60">
                  {email
                    ? `Signed in as ${email}. `
                    : ""}
                  A few quick questions so we can match you to your team and the competition.
                </p>
              </>
            )}
            <PrimaryButton
              onClick={() =>
                setPhase(existingProfile ? (hasExtras ? "extras" : "team") : "userType")
              }
            >
              {existingProfile ? "Continue" : "Get started"}
            </PrimaryButton>
          </div>
        )}

        {phase === "userType" && (
          <UserTypeStep
            onSelect={(type) => {
              setUserType(type);
              setPhase("details");
            }}
          />
        )}

        {phase === "details" && userType && (
          <DetailsForm
            userType={userType}
            submitting={false}
            onComplete={(input) => {
              setProfileInput(input);
              setPhase(hasExtras ? "extras" : "team");
            }}
          />
        )}

        {phase === "extras" && (
          <ExtraFieldsStep
            initial={extraAnswers}
            onComplete={(answers) => {
              setExtraAnswers(answers);
              setPhase("team");
            }}
          />
        )}

        {phase === "team" && (
          <TeamStep
            teams={teams}
            detectedTeam={detectedTeam}
            submitting={submitting}
            error={submitError}
            onSubmit={handleTeamSubmit}
          />
        )}
      </div>

      <p className="text-center text-[0.5rem] font-black uppercase tracking-[0.4em] text-foreground/40">
        RAMSoc · UNSW · Pickabots 2026
      </p>
    </div>
  );
}
