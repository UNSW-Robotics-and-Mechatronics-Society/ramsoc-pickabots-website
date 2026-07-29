import { getBracketState } from "@/lib/db/bracket";
import { applyScheduleStatus } from "@/lib/schedule";
import {
  type BracketMatch, type Division,
  wbRoundsFor, lbRoundsFor,
} from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import FitToViewport from "@/components/obs/FitToViewport";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ division?: string }> };

const CARD_W = 260;

/** This page paints its own solid ground — an opaque "bracket cam" browser
 * source, not a transparent overlay composited over camera. The shared
 * /overlay layout still forces html/body transparent for the whole route
 * group, so this wrapper covers it back over. */
const GROUND: React.CSSProperties = {
  position: "fixed", inset: 0,
  background:
    "radial-gradient(1200px 700px at 15% -10%, rgba(255,107,0,0.10), transparent 60%)," +
    "radial-gradient(1200px 700px at 90% 0%, rgba(76,255,0,0.08), transparent 55%)," +
    "#06080b",
};

function MatchCard({ m }: { m: BracketMatch }) {
  const live = m.status === "active";
  const next = m.status === "next";
  const done = m.status === "completed";
  const aWins = done && m.slotA.score > m.slotB.score;
  const bWins = done && m.slotB.score > m.slotA.score;

  const row = (name: string, score: number, won: boolean, lost: boolean): React.CSSProperties => ({
    display: "flex", justifyContent: "space-between", gap: 10,
    padding: "8px 14px",
    fontSize: "1rem",
    color: won ? GOLD : lost ? "rgba(244,247,251,0.4)" : "#f4f7fb",
    fontWeight: won ? 800 : 500,
    whiteSpace: "nowrap", overflow: "hidden",
  });

  return (
    <div style={{
      width: CARD_W,
      background: PLATE_BG,
      border: live ? "1px solid rgba(255,107,0,0.9)" : next ? `1px solid ${GOLD}` : `1px solid ${PLATE_BORDER}`,
      boxShadow: live ? "0 0 18px rgba(255,107,0,0.55)" : next ? "0 0 14px rgba(255,215,0,0.3)" : "none",
      borderRadius: 8, overflow: "hidden",
      opacity: done ? 0.75 : 1,
    }}>
      {(live || next) && (
        <div style={{
          fontSize: "0.62rem", fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
          textAlign: "center", padding: "3px 0",
          background: live ? "rgba(255,107,0,0.85)" : "rgba(255,215,0,0.85)",
          color: "#06080b",
        }}>
          {live ? "● LIVE" : "UP NEXT"}
        </div>
      )}
      <div style={row(m.slotA.teamName || "TBD", m.slotA.score, aWins, bWins)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.slotA.teamName || "TBD"}</span>
        <span>{m.slotA.score}</span>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />
      <div style={row(m.slotB.teamName || "TBD", m.slotB.score, bWins, aWins)}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.slotB.teamName || "TBD"}</span>
        <span>{m.slotB.score}</span>
      </div>
    </div>
  );
}

function Column({ label, color, matches }: { label: string; color: string; matches: BracketMatch[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: "0.75rem", letterSpacing: 3,
        textTransform: "uppercase", textAlign: "center", color,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 14, flex: 1 }}>
        {matches.length > 0
          ? matches.map(m => <MatchCard key={m.id} m={m} />)
          : <div style={{ width: CARD_W, textAlign: "center", color: "rgba(244,247,251,0.35)", fontSize: "0.85rem" }}>TBD</div>}
      </div>
    </div>
  );
}

/**
 * Simplified, finals-day-only bracket view — a clearer, opaque cousin of
 * /overlay/bracket (which is a transparent OBS overlay meant to composite
 * over camera, and shows the WHOLE tree):
 *   /overlay/finals-bracket                (standard division)
 *   /overlay/finals-bracket?division=open
 * Only the last winners-bracket round, the last losers-bracket round, and
 * the Finals Day column — the part of the bracket that actually matters once
 * the early rounds are done, sized to read from across a room.
 */
export default async function FinalsBracketOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const division: Division = params.division === "open" ? "open" : "standards";

  const bracket = await getBracketState();
  const meta = DIVISION_META[division];
  const matches = applyScheduleStatus(bracket.matches, bracket.schedules[division], division)
    .filter(m => m.division === division);

  const teamCount = bracket.teamCounts[division];
  const wbFinalRound = wbRoundsFor(teamCount);
  const lbFinalRound = lbRoundsFor(teamCount);

  const wbFinal = matches.filter(m => m.side === "winners" && m.round === wbFinalRound);
  const lbFinal = matches.filter(m => m.side === "losers" && m.round === lbFinalRound);
  const finalsSemi = matches.filter(m => m.side === "finals-semi");
  const finalsFinal = matches.filter(m => m.side === "finals-final");
  const finalsThird = matches.filter(m => m.side === "finals-third");

  return (
    <>
      <OverlayRefresh tables={["bracket_matches", "bracket_config", "bracket_schedule"]} intervalMs={3000} />
      <div style={GROUND}>
        <FitToViewport>
          <div style={{ display: "flex", flexDirection: "column", gap: 26, padding: 36, fontFamily: FONT_BODY }}>
            <div style={{
              alignSelf: "center",
              fontFamily: FONT_DISPLAY, fontSize: "1.4rem", letterSpacing: 6, textTransform: "uppercase",
              color: "#f4f7fb", background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
              borderBottom: `3px solid ${meta.color}`, padding: "12px 34px",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}>
              {meta.label} — Finals Day
            </div>

            <div style={{ display: "flex", gap: 32, alignItems: "stretch" }}>
              <Column label="WB Final" color={meta.color} matches={wbFinal} />
              <Column label="LB Final" color="rgba(244,247,251,0.65)" matches={lbFinal} />

              <div style={{
                display: "flex", flexDirection: "column", gap: 18,
                borderLeft: `1px solid ${PLATE_BORDER}`, paddingLeft: 32,
              }}>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontSize: "0.8rem", letterSpacing: 3,
                  textTransform: "uppercase", textAlign: "center", color: GOLD,
                }}>
                  Finals Day
                </div>
                <div style={{ display: "flex", gap: 24, flex: 1, alignItems: "stretch" }}>
                  <Column label="Semi" color="rgba(244,247,251,0.75)" matches={finalsSemi} />
                  <Column label="Grand Final" color={GOLD} matches={finalsFinal} />
                  <Column label="3rd Place" color="rgba(244,247,251,0.55)" matches={finalsThird} />
                </div>
              </div>
            </div>
          </div>
        </FitToViewport>
      </div>
    </>
  );
}
