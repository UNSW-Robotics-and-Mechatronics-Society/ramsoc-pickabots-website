import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY } from "@/components/obs/overlayTheme";
import { type Division } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ text?: string; ring?: string; division?: string }> };

/**
 * Corner badge — a single styled label for compositing anywhere (built for
 * the All Rings multiview quadrant corners, replacing OBS text sources that
 * couldn't match the brand font/plates):
 *   /overlay/label?ring=1&division=standards   → ● RING 1 · STANDARD
 *   /overlay/label?ring=3&division=open        → ● RING 3 · OPEN
 *   /overlay/label?text=COMMENTARY             → ● COMMENTARY (gold)
 *
 * Renders at the page's TOP-LEFT so a small browser source (~520×100) shows
 * just the badge; position the source itself wherever the badge should sit.
 */
export default async function LabelOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const division: Division | null =
    params.division === "open" ? "open" : params.division === "standards" ? "standards" : null;
  const meta = division ? DIVISION_META[division] : null;
  const text = (params.text ?? (params.ring ? `Ring ${params.ring}` : "")).trim();
  if (!text) return null;

  return (
    <div style={{
      position: "fixed", top: 10, left: 10,
      display: "inline-flex", alignItems: "center", gap: 12,
      background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
      borderLeft: `4px solid ${meta?.color ?? GOLD}`,
      padding: "10px 22px",
      fontFamily: FONT_DISPLAY, fontSize: "1.5rem",
      letterSpacing: 3, textTransform: "uppercase",
      color: "#f4f7fb",
      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
      whiteSpace: "nowrap",
    }}>
      {text}
      {meta && (
        <span style={{ fontSize: "0.85rem", letterSpacing: 4, color: meta.color, paddingTop: 4 }}>
          · {meta.label}
        </span>
      )}
    </div>
  );
}
