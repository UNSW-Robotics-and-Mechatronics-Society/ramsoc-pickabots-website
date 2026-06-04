"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/cn";

type Item = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path
          d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/compete",
    label: "Compete",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path
          d="M6 4h12v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V4ZM4 5h2m12 0h2M9 16h6m-3 0v-5m-2 9h4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path
          d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="glass-strong pointer-events-auto flex w-full max-w-md items-center justify-around gap-1 rounded-full px-3 py-2">
        {ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-[0.65rem] tracking-wide transition-colors",
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
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}

        {/* Account slot */}
        <div className="flex flex-1 flex-col items-center gap-1 px-2 py-1.5 text-[0.65rem] tracking-wide text-foreground/55">
          {isSignedIn ? (
            <>
              <span className="flex h-9 w-9 items-center justify-center">
                <UserButton
                  appearance={{ elements: { avatarBox: "h-8 w-8" } }}
                />
              </span>
              Account
            </>
          ) : (
            <Link
              href="/sign-in"
              className="flex flex-col items-center gap-1 hover:text-foreground/80"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path
                    d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
