/* eslint-disable @next/next/no-img-element */
import TitleBackground from "@/components/obs/TitleBackground";
import { GOLD, PLATE_BORDER, FONT_DISPLAY, FONT_BODY, DIVISION_META } from "@/components/obs/overlayTheme";

type Props = { searchParams: Promise<{ year?: string }> };

/**
 * Title card — the "just sumobots" screen: RAMSoc logo + SUMOBOTS <year>.
 *   /overlay/title            (SUMOBOTS 2026)
 *   /overlay/title?year=2027
 *
 * Unlike the other overlays this paints its own full frame — it IS the
 * whole picture (scene "Sumobots"), not a layer over a camera. It brings
 * back the site's animated shader gradient as its background (see
 * TitleBackground), so the holding screen visibly breathes on stream
 * instead of sitting frozen. No data, nothing to refresh.
 */
export default async function TitleOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const year = /^\d{4}$/.test(params.year ?? "") ? params.year : "2026";

  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "3.5vh",
      fontFamily: FONT_BODY,
      // Warm glow layered over the animated gradient behind it.
      background: `
        radial-gradient(ellipse 70% 55% at 50% 42%, rgba(255,107,0,0.10), transparent 70%),
        radial-gradient(ellipse 90% 80% at 50% 110%, rgba(255,215,0,0.05), transparent 60%)`,
    }}>
      <TitleBackground />
      <img
        src="/ramsoc_logo.svg"
        alt="RAMSoc UNSW"
        style={{ width: "16vw", minWidth: 160, filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.7))" }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.6vh" }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "7vw", lineHeight: 1,
          letterSpacing: "0.12em", color: "#f4f7fb",
          textShadow: `0 0 60px rgba(255,107,0,0.35), 0 4px 18px rgba(0,0,0,0.8)`,
        }}>
          SUMOBOTS
        </div>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "2.6vw", letterSpacing: "0.55em",
          color: GOLD, paddingLeft: "0.55em", // re-centres the tracked-out text
          textShadow: "0 2px 12px rgba(0,0,0,0.8)",
        }}>
          {year}
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: "1.4vw",
        fontSize: "0.95vw", letterSpacing: "0.35em", textTransform: "uppercase",
        color: "rgba(244,247,251,0.65)",
        borderTop: `1px solid ${PLATE_BORDER}`, paddingTop: "2vh",
      }}>
        <span style={{ color: DIVISION_META.standards.color }}>⚙ Standard</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
        <span>Robotics &amp; Mechatronics Society UNSW</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
        <span style={{ color: DIVISION_META.open.color }}>◈ Open</span>
      </div>
    </div>
  );
}
