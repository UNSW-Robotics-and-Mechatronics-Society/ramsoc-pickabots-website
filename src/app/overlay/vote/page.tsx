import QRCode from "qrcode";
import { GOLD, PLATE_BORDER, FONT_DISPLAY, FONT_BODY, DIVISION_META } from "@/components/obs/overlayTheme";

// The QR never changes, so render once at build and serve statically.
export const dynamic = "force-static";

const VOTE_URL = "https://pickabots.ramsocunsw.org/voting";

/**
 * "Scan to vote" audience call-to-action — full-frame screen for its own
 * OBS scene ("Vote"): a big QR straight to the voting page, phrased as
 * playing/voting (never betting). Paints its own background like the title
 * card; the QR is baked in at build time so the scene keeps rendering from
 * cache even if the venue internet blips.
 */
export default async function VoteOverlay() {
  const svg = await QRCode.toString(VOTE_URL, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#06080bff", light: "#f4f7fbff" },
  });

  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center", gap: "5vw",
      fontFamily: FONT_BODY,
      background: `
        radial-gradient(ellipse 70% 55% at 50% 42%, rgba(255,107,0,0.10), transparent 70%),
        radial-gradient(ellipse 90% 80% at 50% 110%, rgba(255,215,0,0.05), transparent 60%),
        #06080b`,
    }}>
      {/* QR on a white card so any phone camera locks on instantly */}
      <div style={{
        width: "30vw", maxWidth: 480, aspectRatio: "1",
        background: "#f4f7fb", borderRadius: 18, padding: "1.2vw",
        boxShadow: `0 0 80px rgba(255,107,0,0.25), 0 24px 60px -20px rgba(0,0,0,0.9)`,
      }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "2.6vh", maxWidth: "42vw" }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "1.2vw", letterSpacing: "0.35em",
          textTransform: "uppercase", color: GOLD,
        }}>
          Welcome to Sumobots 2026
        </div>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "3.3vw", lineHeight: 1.15,
          letterSpacing: "0.06em", color: "#f4f7fb", textTransform: "uppercase",
          textShadow: "0 0 60px rgba(255,107,0,0.3), 0 4px 18px rgba(0,0,0,0.8)",
        }}>
          Join Pickabots<br />&amp; Play Along
        </div>
        <div style={{ fontSize: "1.3vw", lineHeight: 1.7, color: "rgba(244,247,251,0.85)", letterSpacing: "0.04em" }}>
          Scan to vote for your champion.<br />
          Back the right bots with your RAM coins<br />
          and climb the leaderboard.
        </div>
        <div style={{
          alignSelf: "flex-start",
          fontFamily: FONT_DISPLAY, fontSize: "1.15vw", letterSpacing: "0.12em",
          textTransform: "uppercase", color: "#06080b",
          background: `linear-gradient(100deg, ${GOLD}, #ffb84d)`,
          padding: "1.3vh 1.8vw", borderRadius: 10,
          boxShadow: "0 0 40px rgba(255,215,0,0.35)",
        }}>
          🏆 Prizes for the top players
        </div>
        <div style={{
          alignSelf: "flex-start",
          display: "flex", alignItems: "center", gap: "0.8vw",
          fontFamily: FONT_DISPLAY, fontSize: "1.1vw", letterSpacing: "0.2em",
          color: GOLD, textTransform: "lowercase",
          border: `1px solid ${PLATE_BORDER}`, background: "rgba(6,8,11,0.7)",
          padding: "1.2vh 1.8vw", borderRadius: 999,
        }}>
          pickabots.ramsocunsw.org
        </div>
        <div style={{
          display: "flex", gap: "1.2vw",
          fontSize: "0.85vw", letterSpacing: "0.3em", textTransform: "uppercase",
          color: "rgba(244,247,251,0.55)",
        }}>
          <span style={{ color: DIVISION_META.standards.color }}>⚙ Standard</span>
          <span>·</span>
          <span style={{ color: DIVISION_META.open.color }}>◈ Open</span>
        </div>
      </div>
    </div>
  );
}
