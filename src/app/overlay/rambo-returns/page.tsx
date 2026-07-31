import { GOLD, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

/**
 * Joke "will return" closing-credits card — full black screen, text fades
 * in staggered (Bond-style "James Bond will return"). Static, no data.
 *   /overlay/rambo-returns
 */
export default function RamboReturnsOverlay() {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "3vh", fontFamily: FONT_BODY,
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .fade-1 { opacity: 0; animation: fadeIn 2s ease-out 0.5s forwards; }
        .fade-2 { opacity: 0; animation: fadeIn 2s ease-out 2.2s forwards; }
        .fade-3 { opacity: 0; animation: fadeIn 2s ease-out 3.9s forwards; }
      `}</style>
      <div className="fade-1" style={{
        fontFamily: FONT_DISPLAY, fontSize: "5vw", letterSpacing: "0.15em",
        color: "#f4f7fb", textTransform: "uppercase", textAlign: "center",
      }}>
        Rambo
      </div>
      <div className="fade-2" style={{
        fontFamily: FONT_DISPLAY, fontSize: "1.6vw", letterSpacing: "0.4em",
        color: "rgba(244,247,251,0.85)", textTransform: "uppercase", textAlign: "center",
        paddingLeft: "0.4em",
      }}>
        Will Return In
      </div>
      <div className="fade-3" style={{
        fontFamily: FONT_DISPLAY, fontSize: "3.2vw", letterSpacing: "0.1em",
        color: GOLD, textTransform: "uppercase", textAlign: "center",
        textShadow: "0 0 40px rgba(255,215,0,0.35)",
      }}>
        Avengers: Doomsday
      </div>
    </div>
  );
}
