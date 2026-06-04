"use client";

import type { ComponentProps } from "react";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";

/**
 * The actual r3f canvas. Loaded only on the client (see ShaderBackground)
 * because @react-three/fiber needs WebGL / window.
 *
 * `gradientConfig` is the exact preset Dash dialed in on shadergradient.co.
 * That export bundles a few editor-only props (axesHelper, gizmoHelper,
 * embedMode, format, frameRate…) that aren't in the component's TS surface
 * but are harmless at runtime — so we spread it with a cast rather than
 * dropping props and risking a different look.
 */
const gradientConfig = {
  animate: "on",
  axesHelper: "off",
  bgColor1: "#000000",
  bgColor2: "#000000",
  brightness: 0.8,
  cAzimuthAngle: 270,
  cDistance: 0.5,
  cPolarAngle: 180,
  cameraZoom: 15.1,
  color1: "#73bfc4",
  color2: "#ff810a",
  color3: "#8da0ce",
  destination: "onCanvas",
  embedMode: "off",
  envPreset: "city",
  format: "gif",
  fov: 45,
  frameRate: 10,
  gizmoHelper: "hide",
  grain: "on",
  lightType: "env",
  pixelDensity: 1,
  positionX: -0.1,
  positionY: 0,
  positionZ: 0,
  range: "disabled",
  rangeEnd: 40,
  rangeStart: 0,
  reflection: 0.4,
  rotationX: 0,
  rotationY: 130,
  rotationZ: 70,
  shader: "defaults",
  type: "sphere",
  uAmplitude: 3.2,
  uDensity: 0.8,
  uFrequency: 5.5,
  uSpeed: 0.3,
  uStrength: 0.3,
  uTime: 0,
  wireframe: false,
} as unknown as ComponentProps<typeof ShaderGradient>;

export default function ShaderGradientScene() {
  return (
    <ShaderGradientCanvas
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      pixelDensity={1}
      fov={45}
    >
      <ShaderGradient {...gradientConfig} />
    </ShaderGradientCanvas>
  );
}
