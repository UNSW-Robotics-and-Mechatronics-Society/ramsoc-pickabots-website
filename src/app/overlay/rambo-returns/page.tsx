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
        .fade-4 { opacity: 0; animation: fadeIn 2s ease-out 5.6s forwards; }
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
      <div className="fade-4" style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      }}>
        {/* Doomsday Clock — hands fixed at 11:57, the real clock's closest-ever setting. */}
        <svg width="72" height="72" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke={GOLD} strokeWidth="3" opacity="0.85" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            const r1 = 38, r2 = 44;
            return (
              <line key={i}
                x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)}
                x2={50 + r2 * Math.sin(a)} y2={50 - r2 * Math.cos(a)}
                stroke={GOLD} strokeWidth="2" opacity="0.7"
              />
            );
          })}
          {/* Minute hand: 57 min -> 342deg. Hour hand: just shy of 12. */}
          <line x1="50" y1="50" x2={50 + 32 * Math.sin((342 * Math.PI) / 180)} y2={50 - 32 * Math.cos((342 * Math.PI) / 180)} stroke="#f4f7fb" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="50" y1="50" x2={50 + 20 * Math.sin((357 * Math.PI) / 180)} y2={50 - 20 * Math.cos((357 * Math.PI) / 180)} stroke="#f4f7fb" strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="50" r="3" fill={GOLD} />
        </svg>
        <div style={{
          fontSize: "0.75vw", letterSpacing: "0.35em",
          color: "rgba(244,247,251,0.6)", textTransform: "uppercase",
          paddingLeft: "0.35em",
        }}>
          3 Minutes To Midnight
        </div>
      </div>
    </div>
  );
}
