import { cn } from "@/lib/cn";

/**
 * Small on/off switch (with a "BID" label) the admin uses to open or lock
 * public bidding on a match. Only rendered on active matches. Stops mousedown
 * so it doesn't start a card drag.
 */
export default function BiddingToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={open}
      aria-label={open ? "Bidding open — click to lock" : "Bidding locked — click to open"}
      title={open ? "Bidding open — click to lock" : "Bidding locked — click to open"}
      onClick={onToggle}
      onMouseDown={e => e.stopPropagation()}
      className="flex shrink-0 items-center gap-1"
    >
      <span className={cn("text-[0.5rem] font-bold uppercase tracking-wide", open ? "text-green-300" : "text-foreground/45")}>
        BID
      </span>
      <span className={cn("relative h-3 w-6 rounded-full transition-colors", open ? "bg-green-400/80" : "bg-white/25")}>
        <span className={cn("absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all", open ? "left-3.5" : "left-0.5")} />
      </span>
    </button>
  );
}
