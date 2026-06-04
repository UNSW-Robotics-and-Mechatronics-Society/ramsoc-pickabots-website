import { cn } from "@/lib/cn";

type Entry = { rank: number; name: string; points: number };

// Placeholder standings — swap for Supabase data in the MVP.
const ENTRIES: Entry[] = [
  { rank: 1, name: "Team Surge", points: 1280 },
  { rank: 2, name: "Bolt Crew", points: 1145 },
  { rank: 3, name: "Cogworks", points: 1090 },
  { rank: 4, name: "Static", points: 940 },
  { rank: 5, name: "Overclock", points: 880 },
  { rank: 6, name: "Null Pointer", points: 815 },
  { rank: 7, name: "Short Circuit", points: 760 },
  { rank: 8, name: "Rust Bucket", points: 690 },
];

const MEDAL = ["bg-amber-400/25 text-amber-200", "bg-slate-300/25 text-slate-100", "bg-orange-500/25 text-orange-200"];

export default function LeaderboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="text-3xl">Leaderboard</h1>
        <p className="text-sm text-foreground/60">Season standings by points.</p>
      </header>

      <ol className="flex flex-col gap-2">
        {ENTRIES.map((e) => (
          <li
            key={e.rank}
            className="glass flex items-center gap-3 rounded-2xl px-4 py-3"
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                e.rank <= 3 ? MEDAL[e.rank - 1] : "bg-white/8 text-foreground/60",
              )}
            >
              {e.rank}
            </span>
            <span className="flex-1 text-sm font-medium">{e.name}</span>
            <span className="text-sm tabular-nums text-foreground/70">
              {e.points.toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
