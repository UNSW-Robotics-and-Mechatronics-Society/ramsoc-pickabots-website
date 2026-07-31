import { GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

/**
 * Timeout banner — lower-third for when a team calls a timeout.
 *   /overlay/timeout
 *
 * Composites over the ring camera (same as now-battling): transparent page
 * background, a single plate holding the headline + notice. Static text,
 * nothing to refresh.
 */
export default function TimeoutOverlay() {
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: "4vh",
      display: "flex", justifyContent: "center",
      fontFamily: FONT_BODY,
    }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
        borderBottom: `3px solid ${GOLD}`,
        padding: "20px 48px", borderRadius: 10,
        textAlign: "center", maxWidth: "70vw",
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "1.1rem", letterSpacing: "0.45em",
          color: GOLD, paddingLeft: "0.45em", // re-centres the tracked-out text
          textTransform: "uppercase",
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}>
          Time Out
        </div>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "1.8rem", lineHeight: 1.2,
          letterSpacing: "0.04em", color: "#f4f7fb",
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}>
          Team has called for a time&nbsp;out!
        </div>
        <div style={{
          fontSize: "0.8rem", letterSpacing: "0.15em",
          color: "rgba(244,247,251,0.75)",
          borderTop: `1px solid ${PLATE_BORDER}`, paddingTop: 8,
        }}>
          Teams have 2 minutes to fix their issues, wish them luck!
        </div>
      </div>
    </div>
  );
}
