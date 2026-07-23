"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Trophy, Swords, CalendarClock, LogIn, type LucideIcon } from "lucide-react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/voting",      label: "Vote",        Icon: Coins       },
  { href: "/leaderboard", label: "Leaderboard",  Icon: Trophy      },
  { href: "/competition", label: "Bracket",      Icon: Swords      },
  { href: "/matches",     label: "Matches",      Icon: CalendarClock },
];

export default function AdminNavBar() {
  const pathname    = usePathname();
  const { isSignedIn } = useAuth();

  return (
    <nav className="glass-nav flex items-center gap-0.5 rounded-full px-1.5 py-1.5">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all",
              active
                ? "bg-white/20 text-foreground ring-1 ring-white/30"
                : "text-foreground/50 hover:text-foreground/80",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {label}
          </Link>
        );
      })}

      {/* Account */}
      <div className="ml-1 flex items-center justify-center px-1.5">
        {isSignedIn ? (
          <UserButton appearance={{ elements: { avatarBox: "h-6 w-6" } }} />
        ) : (
          <Link
            href="/sign-in"
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-foreground/50 transition-all hover:text-foreground/80"
          >
            <LogIn className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
