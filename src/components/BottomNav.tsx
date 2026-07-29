"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Coins, Trophy, Swords, CalendarClock, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAdminPanels } from "@/components/admin/AdminPanelContext";

type Item = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const ITEMS: Item[] = [
  { href: "/voting", label: "Vote", Icon: Coins },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/competition", label: "Bracket", Icon: Swords },
  { href: "/matches", label: "Matches", Icon: CalendarClock },
];

const MY_TEAM_ITEM: Item = { href: "/my-matches", label: "My Team", Icon: Users };

export default function BottomNav() {
  const pathname = usePathname();
  const { bracketFullscreen } = useAdminPanels();
  const { isSignedIn } = useUser();

  // Only players who linked a competing team during onboarding (see
  // TeamStep — spectators skip this) get the "My Team" tab; everyone else's
  // nav stays exactly as it was. Checked once per sign-in rather than kept
  // in sync live — a team link only ever happens during onboarding, which
  // already hard-navigates afterwards.
  const [hasTeam, setHasTeam] = useState(false);
  useEffect(() => {
    if (!isSignedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasTeam(false);
      return;
    }
    let cancelled = false;
    fetch("/api/my-team")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled) setHasTeam(!!data?.team);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const items = hasTeam ? [...ITEMS, MY_TEAM_ITEM] : ITEMS;

  // Hide on sign-in/sign-up/standby, on admin (admin has its own inline nav),
  // and while the bracket is in full-screen mode (which wants a bare canvas +
  // exit button only).
  if (
    bracketFullscreen ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/standby") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/dev") ||
    pathname.startsWith("/admin") ||
    // Stream control wants every pixel for tap targets; overlays are OBS
    // browser sources composited onto the stream — site chrome would be
    // broadcast to the audience.
    pathname.startsWith("/control") ||
    pathname.startsWith("/overlay")
  ) {
    return null;
  }

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="glass-nav pointer-events-auto flex w-full max-w-md items-center justify-around gap-1 rounded-full px-3 py-2">
        {items.map(({ href, label, Icon }) => {
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
