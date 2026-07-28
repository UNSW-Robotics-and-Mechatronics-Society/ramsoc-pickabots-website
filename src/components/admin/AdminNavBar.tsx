"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Trophy, Swords, CalendarClock, MonitorPlay, LogIn, type LucideIcon } from "lucide-react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/voting",      label: "Vote",        Icon: Coins       },
  { href: "/leaderboard", label: "Leaderboard",  Icon: Trophy      },
  { href: "/competition", label: "Bracket",      Icon: Swords      },
  { href: "/matches",     label: "Matches",      Icon: CalendarClock },
  { href: "/control",     label: "Stream",       Icon: MonitorPlay },
];

export default function AdminNavBar() {
  const pathname    = usePathname();
  const { isSignedIn } = useAuth();

  return (
    // overflow-x-auto is a safety net for very narrow phones; labels collapse
    // to icon-only below sm so five items + avatar fit without scrolling on
    // most devices.
    <nav className="glass-nav no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full px-1.5 py-1.5">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all sm:px-3",
              active
                ? "bg-white/20 text-foreground ring-1 ring-white/30"
                : "text-foreground/50 hover:text-foreground/80",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}

      {/* Account */}
      <div className="ml-1 flex shrink-0 items-center justify-center px-1.5">
        {isSignedIn ? (
          <UserButton appearance={{ elements: { avatarBox: "h-6 w-6" } }} />
        ) : (
          <Link
            href="/sign-in"
            title="Sign in"
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground/50 transition-all hover:text-foreground/80 sm:px-3"
          >
            <LogIn className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="hidden sm:inline">Sign in</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
