"use client";

import dynamic from "next/dynamic";

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
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-background"
    >
      <ShaderGradientScene />
    </div>
  );
}
