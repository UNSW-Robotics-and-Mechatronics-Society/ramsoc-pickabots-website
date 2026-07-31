import TitleBackground from "@/components/obs/TitleBackground";
import { GOLD, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

/**
 * Timeout card — full-frame holding screen for when a team calls a timeout.
 *   /overlay/timeout
 *
 * Like the title card, this paints its own whole picture (animated shader
 * gradient via TitleBackground) rather than compositing over a camera.
 * Static text, nothing to refresh.
 */
export default function TimeoutOverlay() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "4vh",
      fontFamily: FONT_BODY,
      // Warm glow layered over the animated gradient behind it.
      background: `
        radial-gradient(ellipse 70% 55% at 50% 42%, rgba(255,107,0,0.10), transparent 70%),
        radial-gradient(ellipse 90% 80% at 50% 110%, rgba(255,215,0,0.05), transparent 60%)`,
    }}>
      <TitleBackground />
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: "3vw", letterSpacing: "0.45em",
        color: GOLD, paddingLeft: "0.45em", // re-centres the tracked-out text
        textTransform: "uppercase",
        textShadow: "0 2px 12px rgba(0,0,0,0.8)",
      }}>
        Time Out
      </div>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: "4.5vw", lineHeight: 1.15,
        letterSpacing: "0.06em", color: "#f4f7fb", textAlign: "center",
        maxWidth: "80vw",
        textShadow: "0 0 60px rgba(255,107,0,0.35), 0 4px 18px rgba(0,0,0,0.8)",
      }}>
        Team has called for a time&nbsp;out!
      </div>
      <div style={{
        fontSize: "1.4vw", letterSpacing: "0.18em",
        color: "rgba(244,247,251,0.75)", textAlign: "center",
        borderTop: `1px solid ${PLATE_BORDER}`, paddingTop: "2.5vh",
      }}>
        Teams have 2 minutes to fix their issues, wish them luck!
      </div>
    </div>
  );
}
