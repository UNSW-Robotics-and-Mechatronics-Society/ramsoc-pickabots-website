import type { ReactNode } from "react";

export const metadata = {
  title: "Pickabots Overlay",
  // Overlays are for OBS, not for people or crawlers.
  robots: { index: false, follow: false },
};

/**
 * Shared shell for every /overlay/* page — each of which is rendered inside an
 * OBS Browser Source and composited OVER a live camera feed. The one hard
 * requirement is a fully transparent page background: globals.css paints
 * `body` with the site background, so this layout overrides it (the shader
 * canvas and bottom nav are already suppressed for /overlay in their own
 * components). OBS's browser source has `background: transparent` by default;
 * anything we paint here ends up on the broadcast.
 */
export default function OverlayLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body { overflow: hidden; }
      `}</style>
      {children}
    </>
  );
}
