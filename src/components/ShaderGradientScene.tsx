"use client";

import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";

export default function ShaderGradientScene() {
  return (
    <>
      <ShaderGradientCanvas
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <ShaderGradient
          type="waterPlane"
          animate="on"
          uSpeed={0.025}
          uStrength={1.4}
          uDensity={1.3}
          uFrequency={5}
          uAmplitude={2.5}
          color1="#39648e"
          color2="#0d1e2a"
          color3="#000005"
          rotationX={48}
          rotationY={0}
          rotationZ={-25}
          positionX={0}
          positionY={0}
          positionZ={0}
          reflection={0.07}
          wireframe={false}
          shader="defaults"
        />
      </ShaderGradientCanvas>

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
          opacity: 0.07,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
