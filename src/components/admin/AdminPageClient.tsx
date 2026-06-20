"use client";

import { useMemo, useState } from "react";
import { type BracketMatch, type Division, type Team, MOCK_BRACKET_MATCHES, MOCK_TEAMS } from "@/lib/mock-data";
import ResizableSplit from "./ResizableSplit";
import TeamList from "./TeamList";
import AdminBracket from "./AdminBracket";

type Props = { division: Division };

function computeEliminated(matches: BracketMatch[]): Set<string> {
  const out = new Set<string>();
  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const aWon = m.slotA.score >= m.targetScore;
    const bWon = m.slotB.score >= m.targetScore;
    if (aWon && m.slotB.teamName) out.add(m.slotB.teamName);
    if (bWon && m.slotA.teamName) out.add(m.slotA.teamName);
  }
  return out;
}

export default function AdminPageClient({ division }: Props) {
  const [matches, setMatches] = useState<BracketMatch[]>(MOCK_BRACKET_MATCHES);
  const eliminatedTeams = useMemo(() => computeEliminated(matches), [matches]);

  return (
    <ResizableSplit
      left={
        <TeamList
          teams={MOCK_TEAMS}
          division={division}
          eliminatedTeams={eliminatedTeams}
        />
      }
      right={
        <AdminBracket
          teams={MOCK_TEAMS}
          matches={matches}
          division={division}
          onMatchesChange={setMatches}
        />
      }
    />
  );
}
