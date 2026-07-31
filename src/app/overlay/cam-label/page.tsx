import { GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY } from "@/components/obs/overlayTheme";

type Props = { searchParams: Promise<{ name?: string }> };

/**
 * Small corner badge identifying which camera a scene is showing.
 *   /overlay/cam-label?name=IT
 *
 * Composites over the camera feed (top-left, out of the way of any other
 * overlay). Static text, nothing to refresh — one instance per camera scene,
 * just a different `name`.
 */
export default async function CamLabelOverlay({ searchParams }: Props) {
  const { name } = await searchParams;
  if (!name) return null;

  return (
    <div style={{
      position: "fixed", top: "3vh", left: "3vh",
      display: "flex",
    }}>
      <div style={{
        background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
        borderLeft: `3px solid ${GOLD}`,
        padding: "8px 20px", borderRadius: 6,
        fontFamily: FONT_DISPLAY, fontSize: "1.1rem", letterSpacing: "0.15em",
        color: "#f4f7fb", textTransform: "uppercase",
        textShadow: "0 2px 8px rgba(0,0,0,0.8)",
      }}>
        {name}
      </div>
    </div>
  );
}
