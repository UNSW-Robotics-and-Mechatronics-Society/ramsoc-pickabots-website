import { getBracketState } from "@/lib/db/bracket";
import { applyScheduleStatus } from "@/lib/schedule";
import {
  type BracketMatch, type Division,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
} from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import FitToViewport from "@/components/obs/FitToViewport";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ division?: string }> };

const CARD_W = 220;

function MatchCard({ m }: { m: BracketMatch }) {
  const live = m.status === "active";
  const next = m.status === "next";
  const done = m.status === "completed";
  const aWins = done && m.slotA.score > m.slotB.score;
  const bWins = done && m.slotB.score > m.slotA.score;

  const row = (name: string, score: number, won: boolean, lost: boolean): React.CSSProperties => ({
    display: "flex", justifyContent: "space-between", gap: 8,
    padding: "4px 10px",
    fontSize: "0.72rem",
    color: won ? GOLD : lost ? "rgba(244,247,251,0.4)" : "#f4f7fb",
    fontWeight: won ? 800 : 500,
    whiteSpace: "nowrap", overflow: "hidden",
  });

  return (
    <div style={{
      width: CARD_W,
      background: PLATE_BG,
      border: live ? "1px solid rgba(255,107,0,0.9)" : next ? `1px solid ${GOLD}` : `1px solid ${PLATE_BORDER}`,
      boxShadow: live ? "0 0 14px rgba(255,107,0,0.55)" : next ? "0 0 10px rgba(255,215,0,0.3)" : "none",
      borderRadius: 6, overflow: "hidden",
      opacity: done ? 0.75 : 1,
    }}>
      {(live || next) && (
        <div style={{
          fontSize: "0.5rem", fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
          textAlign: "center", padding: "2px 0",
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

function RoundColumn({ label, matches }: { label: string; matches: BracketMatch[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: "0.6rem", letterSpacing: 2,
        textTransform: "uppercase", textAlign: "center",
        color: "rgba(244,247,251,0.65)",
      }}>
        {label}
      </div>
      {/* Space matches evenly down the column so feeder pairs sit alongside
          their target, the classic bracket silhouette. */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 10, flex: 1 }}>
        {matches.map(m => <MatchCard key={m.id} m={m} />)}
      </div>
    </div>
  );
}

/**
 * Full-bracket overlay for the intermission scene:
 *   /overlay/bracket                (standard division)
 *   /overlay/bracket?division=open
 * Winners bracket on top, losers below, finals column on the right. LIVE and
 * UP NEXT matches carry lit banners (statuses are ring-derived, same as the
 * public views). Scaled down automatically if the bracket outgrows the source.
 */
export default async function BracketOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const division: Division = params.division === "open" ? "open" : "standards";

  const bracket = await getBracketState();
  const meta = DIVISION_META[division];
  const matches = applyScheduleStatus(bracket.matches, bracket.schedules[division], division)
    .filter(m => m.division === division);

  // This division's own bracket size — the two divisions can differ.
  const teamCount = bracket.teamCounts[division];
  const wbRounds = wbRoundsFor(teamCount);
  const lbRounds = lbRoundsFor(teamCount);
  const bySideRound = (side: BracketMatch["side"], round: number) =>
    matches
      .filter(m => m.side === side && m.round === round)
      .sort((a, b) => a.matchNumber - b.matchNumber);

  const finals = (["finals-semi", "finals-final", "finals-third"] as const)
    .flatMap(side => matches.filter(m => m.side === side));

  return (
    <>
      <OverlayRefresh tables={["bracket_matches", "bracket_config", "bracket_schedule"]} intervalMs={3000} />
      <FitToViewport>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: 24, fontFamily: FONT_BODY }}>
          <div style={{
            alignSelf: "center",
            fontFamily: FONT_DISPLAY, fontSize: "1.2rem", letterSpacing: 5, textTransform: "uppercase",
            color: "#f4f7fb", background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            borderBottom: `3px solid ${meta.color}`, padding: "10px 28px",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            {meta.label} Bracket
          </div>

          <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
            {/* Winners over losers, each band labelled so the split reads
                instantly on stream */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{
                fontFamily: FONT_DISPLAY, fontSize: "0.7rem", letterSpacing: 4,
                textTransform: "uppercase", color: meta.color,
              }}>
                Winners Bracket
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                {Array.from({ length: wbRounds }, (_, i) => i + 1).map(r => (
                  <RoundColumn key={`wb-${r}`} label={wbRoundLabel(r, wbRounds)} matches={bySideRound("winners", r)} />
                ))}
              </div>
              <div style={{
                marginTop: 8, paddingTop: 14,
                borderTop: `1px solid ${PLATE_BORDER}`,
                fontFamily: FONT_DISPLAY, fontSize: "0.7rem", letterSpacing: 4,
                textTransform: "uppercase", color: "rgba(244,247,251,0.55)",
              }}>
                Losers Bracket
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                {Array.from({ length: lbRounds }, (_, i) => i + 1).map(r => {
                  const ms = bySideRound("losers", r);
                  return ms.length > 0
                    ? <RoundColumn key={`lb-${r}`} label={lbRoundLabel(r, lbRounds)} matches={ms} />
                    : null;
                })}
              </div>
            </div>

            {/* Finals day */}
            {finals.length > 0 && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 10,
                borderLeft: `1px solid ${PLATE_BORDER}`, paddingLeft: 24,
              }}>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontSize: "0.6rem", letterSpacing: 2,
                  textTransform: "uppercase", textAlign: "center", color: GOLD,
                }}>
                  Finals
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 10, flex: 1 }}>
                  {finals.map(m => <MatchCard key={m.id} m={m} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      </FitToViewport>
    </>
  );
}
