"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// ssr:false keeps the WebGL canvas out of server rendering — only allowed
// inside a Client Component (Next 16).
const ShaderGradientScene = dynamic(() => import("./ShaderGradientScene"), {
  ssr: false,
});

/**
 * Full-viewport animated gradient that sits behind all app content.
 * Fixed + -z so it never intercepts touches or scrolls with the page.
 */
export default function ShaderBackground() {
  const pathname = usePathname();
  // Overlay routes render inside OBS browser sources over live camera feeds —
  // they must stay fully transparent (see app/overlay/layout.tsx), and a
  // WebGL canvas per source is also wasted GPU on the streaming PC.
  if (pathname.startsWith("/overlay")) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-background"
    >
      <ShaderGradientScene />
    </div>
  );
}
