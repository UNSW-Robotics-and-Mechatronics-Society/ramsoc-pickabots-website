"use client";

import dynamic from "next/dynamic";

// Same animated WebGL gradient the site uses (ssr:false for the canvas, as
// in components/ShaderBackground) — but mounted BY the title overlay rather
// than the root layout, which deliberately suppresses the shader on all
// /overlay routes. The title card is the one overlay that IS the whole
// picture, so it gets the site's living background back; the compositing
// overlays stay transparent and GPU-free.
const ShaderGradientScene = dynamic(() => import("@/components/ShaderGradientScene"), {
  ssr: false,
});

export default function TitleBackground() {
  return (
    <div
      aria-hidden
      style={{ position: "fixed", inset: 0, zIndex: -1, background: "#06080b", pointerEvents: "none" }}
    >
      <ShaderGradientScene />
    </div>
  );
}
