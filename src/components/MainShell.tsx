"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Routes that break out of the centered reading column and fill the whole
// viewport width — the bracket tree and the matches table both need every
// pixel (and full-width gesture surfaces) so pan/scroll works anywhere, not
// just inside the ~448px column the rest of the site uses.
const FULL_BLEED = ["/competition", "/matches"];

/**
 * The app's <main> wrapper. Most routes render inside a narrow, centered
 * column; the bracket and matches pages render full-width instead. Kept as a
 * client component purely so it can read the current path — the layout itself
 * stays a server component.
 */
export default function MainShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = FULL_BLEED.some(p => pathname.startsWith(p));

  const className = fullBleed
    ? "relative z-10 flex min-h-dvh w-full flex-col"
    : "relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-32 pt-6";

  return <main className={className}>{children}</main>;
}
