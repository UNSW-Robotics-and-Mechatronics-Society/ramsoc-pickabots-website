// Broadcast palette for the /overlay/* pages. Deliberately its own copy
// rather than importing COMP_META from components/Ring.tsx: that module is
// 'use client' (the overlays are server components), and broadcast overlays
// tune contrast for compositing over video, not for the site's glass UI —
// the two shouldn't be forced to move together.
import type { Division } from "@/lib/mock-data";

export const DIVISION_META: Record<Division, { color: string; label: string }> = {
  standards: { color: "#FF6B00", label: "STANDARD" },
  open:      { color: "#4cff00", label: "OPEN" },
};

export const GOLD = "#FFD700";

/** Near-opaque dark plate — readable over any camera feed. */
export const PLATE_BG = "rgba(6, 8, 11, 0.88)";
export const PLATE_BORDER = "rgba(255, 255, 255, 0.18)";

export const FONT_DISPLAY = "var(--font-audiowide), system-ui, sans-serif";
export const FONT_BODY = "var(--font-anta), system-ui, sans-serif";
