import { cn } from "@/lib/cn";

type Slot = { name: string; score?: number; winner?: boolean };
type BracketMatch = { id: string; a: Slot; b: Slot };
type Round = { name: string; matches: BracketMatch[] };

// Placeholder single-elim bracket — swap for Supabase data in the MVP.
const ROUNDS: Round[] = [
  {
    name: "Quarterfinals",
    matches: [
      { id: "qf1", a: { name: "Crusher", score: 3, winner: true }, b: { name: "Vortex", score: 1 } },
      { id: "qf2", a: { name: "Ironclad", score: 0 }, b: { name: "Sparkplug", score: 2, winner: true } },
      { id: "qf3", a: { name: "Meltdown", score: 2, winner: true }, b: { name: "Riptide", score: 2 } },
      { id: "qf4", a: { name: "Gigabyte", score: 3, winner: true }, b: { name: "Tinhead", score: 0 } },
    ],
  },
  {
    name: "Semifinals",
    matches: [
      { id: "sf1", a: { name: "Crusher" }, b: { name: "Sparkplug" } },
      { id: "sf2", a: { name: "Meltdown" }, b: { name: "Gigabyte" } },
    ],
  },
  {
    name: "Final",
    matches: [{ id: "f1", a: { name: "TBD" }, b: { name: "TBD" } }],
  },
];

function Slot({ slot }: { slot: Slot }) {
  const tbd = slot.name === "TBD";
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl px-3 py-2",
        slot.winner ? "bg-white/90 text-black" : "bg-white/5",
        tbd && "text-foreground/40",
      )}
    >
      <span className="text-sm font-medium">{slot.name}</span>
      {slot.score !== undefined && (
        <span
          className={cn(
            "text-sm tabular-nums",
            slot.winner ? "text-black/70" : "text-foreground/60",
          )}
        >
          {slot.score}
        </span>
      )}
    </div>
  );
}

export default function CompetitionPage() {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="text-3xl">Competition</h1>
        <p className="text-sm text-foreground/60">Single-elimination bracket.</p>
      </header>

      {ROUNDS.map((round) => (
        <section key={round.name} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm uppercase tracking-[0.18em] text-foreground/55">
            {round.name}
          </h2>
          <div className="flex flex-col gap-3">
            {round.matches.map((m) => (
              <div key={m.id} className="glass flex flex-col gap-1.5 rounded-2xl p-2">
                <Slot slot={m.a} />
                <Slot slot={m.b} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
