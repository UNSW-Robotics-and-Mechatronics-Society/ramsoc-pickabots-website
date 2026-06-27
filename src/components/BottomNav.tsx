"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Trophy, Swords, LogIn, type LucideIcon } from "lucide-react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/cn";

type Item = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const ITEMS: Item[] = [
  { href: "/bid", label: "Bid", Icon: Coins },
  { href: "/leaderboard", label: "Leaderboard", Icon: Trophy },
  { href: "/competition", label: "Bracket", Icon: Swords },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  // Hide on sign-in/sign-up and admin (admin has its own inline nav)
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
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

        {/* Account slot */}
        <div className="flex flex-1 flex-col items-center gap-1 px-1 py-1.5 text-[0.6rem] tracking-wide text-foreground/55">
          {isSignedIn ? (
            <>
              <span className="flex h-9 w-9 items-center justify-center">
                <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
              </span>
              Account
            </>
          ) : (
            <Link
              href="/sign-in"
              className="flex flex-col items-center gap-1 hover:text-foreground/80"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full">
                <LogIn className="h-5 w-5" strokeWidth={2} />
              </span>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
