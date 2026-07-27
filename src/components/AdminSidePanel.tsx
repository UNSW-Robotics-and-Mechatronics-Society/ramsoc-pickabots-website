"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAdminPanels } from "@/components/admin/AdminPanelContext";

export default function AdminSidePanel() {
  const { user, isLoaded }           = useUser();
  const pathname                     = usePathname();
  const searchParams                 = useSearchParams();
  const { bracketFullscreen }        = useAdminPanels();

  if (!isLoaded) return null;
  if ((user?.publicMetadata as { role?: string } | undefined)?.role !== "admin") return null;
  if (bracketFullscreen) return null;

  const isOnAdmin       = pathname.startsWith("/admin");
  const currentDivision = searchParams.get("division") ?? "standards";

  return (
    <div className="pointer-events-none fixed right-4 top-6 z-50 flex items-start gap-2">
      {/* Division toggle (admin only) — panels are added from the grid's
          palette tray, not here. */}
      {isOnAdmin && (
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="glass-nav flex items-center gap-1 rounded-full px-1.5 py-1.5">
            <Link
              href="/admin?division=standards"
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                currentDivision === "standards"
                  ? "bg-white/20 text-foreground ring-1 ring-white/30"
                  : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              Standards
            </Link>
            <Link
              href="/admin?division=open"
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                currentDivision === "open"
                  ? "bg-white/20 text-foreground ring-1 ring-white/30"
                  : "text-foreground/50 hover:text-foreground/80",
              )}
            >
              Open
            </Link>
          </div>
        </div>
      )}

      {/* Division toggle on non-admin pages */}
      {!isOnAdmin && (
        <div className="glass-nav pointer-events-auto flex items-center gap-1 rounded-full px-1.5 py-1.5">
          <Link
            href="/admin?division=standards"
            className="rounded-full px-3 py-1 text-xs font-semibold text-foreground/50 transition-all hover:text-foreground/80"
          >
            Standards
          </Link>
          <Link
            href="/admin?division=open"
            className="rounded-full px-3 py-1 text-xs font-semibold text-foreground/50 transition-all hover:text-foreground/80"
          >
            Open
          </Link>
        </div>
      )}

      {/* Admin shield button — toggles between the admin dashboard and the
          public Bid page depending on where you currently are. */}
      <Link
        href={isOnAdmin ? "/voting" : `/admin?division=${currentDivision}`}
        className={cn(
          "pointer-events-auto flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[0.6rem] font-semibold tracking-widest transition-colors",
          "border",
          isOnAdmin
            ? "border-white/25 bg-white/10 text-foreground backdrop-blur-md"
            : "border-white/10 bg-white/5 text-foreground/50 backdrop-blur-md hover:border-white/20 hover:text-foreground/80",
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            isOnAdmin ? "bg-white/20" : "bg-white/8",
          )}
        >
          <ShieldCheck className="h-5 w-5" strokeWidth={2} />
        </span>
        ADMIN
      </Link>
    </div>
  );
}
