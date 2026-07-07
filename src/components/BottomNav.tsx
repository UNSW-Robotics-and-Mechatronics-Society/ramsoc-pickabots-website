"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Trophy, Swords, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Item = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const ITEMS: Item[] = [
  { href: "/voting", label: "Bid", Icon: Coins },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/competition", label: "Bracket", Icon: Swords },
];

export default function BottomNav() {
  const pathname = usePathname();
  
  // Hide on sign-in/sign-up/standby, and on admin (admin has its own inline nav)
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/standby") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="glass-nav pointer-events-auto flex w-full max-w-md items-center justify-around gap-1 rounded-full px-3 py-2">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[0.6rem] tracking-wide transition-colors",
                active
                  ? "text-foreground"
                  : "text-foreground/55 hover:text-foreground/80",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                  active && "bg-white/15",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
