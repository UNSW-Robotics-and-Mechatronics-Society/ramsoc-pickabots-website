import MatchRow, { type Match } from "@/components/MatchRow";

// Placeholder fixtures — 4 matches "going on". Swap for Supabase data in the MVP.
const MATCHES: Match[] = [
  {
    id: "m1",
    label: "Match 1",
    status: "live",
    a: { name: "Crusher", odds: 62 },
    b: { name: "Vortex", odds: 38 },
  },
  {
    id: "m2",
    label: "Match 2",
    status: "live",
    a: { name: "Ironclad", odds: 45 },
    b: { name: "Sparkplug", odds: 55 },
  },
  {
    id: "m3",
    label: "Match 3",
    status: "starting",
    a: { name: "Meltdown", odds: 50 },
    b: { name: "Riptide", odds: 50 },
  },
  {
    id: "m4",
    label: "Match 4",
    status: "starting",
    a: { name: "Gigabyte", odds: 71 },
    b: { name: "Tinhead", odds: 29 },
  },
];

export default function BidPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="text-3xl">Bid</h1>
        <p className="text-sm text-foreground/60">
          Pick the winner of each live match. {MATCHES.length} matches on now.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {MATCHES.map((match) => (
          <MatchRow key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}
