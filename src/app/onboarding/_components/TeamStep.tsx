"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import type { OnboardingTeam, TeamRole } from "@/lib/db/profiles";
import { PrimaryButton, SecondaryButton } from "./ui";

const SPECTATOR = "__spectator__";

function divisionLabel(division: OnboardingTeam["division"]): string {
  return division === "standards" ? "Standard" : "Open";
}

export default function TeamStep({
  teams,
  detectedTeam,
  submitting,
  error,
  onSubmit,
}: {
  teams: OnboardingTeam[];
  detectedTeam: { team: OnboardingTeam; role: TeamRole } | null;
  submitting?: boolean;
  error?: string | null;
  /** teamId === null means "spectating / no team". */
  onSubmit: (teamId: string | null) => void;
}) {
  // If we detected a team, show the confirmation card first; "Pick a different
  // team" reveals the manual picker.
  const [picking, setPicking] = useState(!detectedTeam);
  const [selected, setSelected] = useState("");

  const grouped = useMemo(() => {
    const standards = teams.filter((t) => t.division === "standards");
    const open = teams.filter((t) => t.division === "open");
    return { standards, open };
  }, [teams]);

  if (!picking && detectedTeam) {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="mb-2 text-2xl">Your team</h2>
          <p className="text-sm text-foreground/50">
            We matched you to a registered team. Is this right?
          </p>
        </div>

        <div
          className="flex flex-col items-center gap-2 rounded-2xl border border-[#FF6B00]/25 p-6 text-center"
          style={{ background: "rgba(255,107,0,0.06)", boxShadow: "0 0 40px rgba(255,107,0,0.08)" }}
        >
          <Users className="h-6 w-6 text-[#FF6B00]" strokeWidth={2} />
          <div className="font-display text-lg text-foreground">{detectedTeam.team.name}</div>
          <div className="text-xs uppercase tracking-widest text-foreground/50">
            {divisionLabel(detectedTeam.team.division)} Division
            {detectedTeam.role === "captain" && " · Captain"}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => onSubmit(detectedTeam.team.id)} loading={submitting}>
            Yes, that&apos;s my team
          </PrimaryButton>
          <SecondaryButton onClick={() => setPicking(true)} disabled={submitting}>
            Pick a different team
          </SecondaryButton>
        </div>
      </div>
    );
  }

  const chosenTeamId = selected && selected !== SPECTATOR ? selected : null;
  const hasChoice = selected !== "";

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="mb-2 text-2xl">Pick your team</h2>
        <p className="text-sm text-foreground/50">
          Choose the team you&apos;re competing with, or spectate without one.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-foreground/70">Team</span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="min-h-[44px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-[#FF6B00]/60"
        >
          <option value="" disabled>
            Select a team…
          </option>
          <option value={SPECTATOR} className="bg-[#0d1018]">
            I&apos;m just spectating (no team)
          </option>
          {grouped.standards.length > 0 && (
            <optgroup label="Standard Division">
              {grouped.standards.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#0d1018]">
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          {grouped.open.length > 0 && (
            <optgroup label="Open Division">
              {grouped.open.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#0d1018]">
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        <PrimaryButton
          onClick={() => onSubmit(chosenTeamId)}
          loading={submitting}
          disabled={!hasChoice}
        >
          {selected === SPECTATOR ? "Continue as spectator" : "Join team"}
        </PrimaryButton>
        {detectedTeam && (
          <SecondaryButton onClick={() => setPicking(false)} disabled={submitting}>
            Back
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}
