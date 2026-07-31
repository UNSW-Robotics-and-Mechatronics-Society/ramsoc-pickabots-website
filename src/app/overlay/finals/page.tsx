import { getBracketState } from "@/lib/db/bracket";
import { isFinalsMatch, type BracketMatch } from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

const BRONZE = "#CD7F32";

/** Same naming scheme as the admin Finals tab and public MatchList. */
function finalsLabel(m: BracketMatch): string {
  const div = DIVISION_META[m.division].label;
  if (m.side === "finals-semi")  return `${div} Semi ${m.matchNumber}`;
  if (m.side === "finals-third") return `${div} Bronze`;
  return `${div} Final`;
}

function accentFor(m: BracketMatch): string {
  if (m.side === "finals-final") return GOLD;
  if (m.side === "finals-third") return BRONZE;
  return DIVISION_META[m.division].color;
}

/**
 * Finals Day running-order board — the whole day's card (both divisions'
 * semis, bronze matches and finals) on one screen, in the order it's
 * actually played on the shared Finals Day ring (see FinalsSchedule):
 *   /overlay/finals
 * Statuses are admin-controlled (the Finals tab dropdown, not ring position —
 * see schedule.ts), so this reads them straight off each match, same as
 * /overlay/now-battling. Sized as a centered full-screen board for its own
 * OBS scene ("Finals").
 */
export default async function FinalsOverlay() {
  const bracket = await getBracketState();
  const byId = new Map(bracket.matches.filter(isFinalsMatch).map(m => [m.id, m]));

  // Play order comes from the Finals Day ring itself, not a fixed list — the
  // admin can hand-reorder it (see rollFinalsSchedule), and that reorder has
  // to be what shows on stream.
  const order = bracket.finalsSchedule.rings[0] ?? [];
  const entries = order.map(e => byId.get(e.matchId)).filter((m): m is BracketMatch => !!m);

  return (
    <>
      <OverlayRefresh tables={["bracket_matches", "bracket_schedule"]} intervalMs={3000} />
      <div style={{
        position: "fixed", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: FONT_BODY,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 760, maxWidth: "82vw" }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: "1.4rem", letterSpacing: 6,
            textTransform: "uppercase", textAlign: "center", color: "#f4f7fb",
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            borderBottom: `3px solid ${GOLD}`, padding: "14px 24px",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            Finals Day
          </div>

          {entries.length === 0 && (
            <div style={{
              background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
              padding: "16px 24px", textAlign: "center",
              color: "rgba(244,247,251,0.6)", letterSpacing: 1,
            }}>
              The finals card isn&apos;t set yet
            </div>
          )}

          {entries.map(m => {
            const accent = accentFor(m);
            const live = m.status === "active";
            const next = m.status === "next";
            const done = m.status === "completed";
            const aWon = done && m.slotA.score > m.slotB.score;
            const bWon = done && m.slotB.score > m.slotA.score;
            const name = (won: boolean, lost: boolean): React.CSSProperties => ({
              fontFamily: FONT_DISPLAY, fontSize: "1.1rem",
              color: won ? GOLD : lost ? "rgba(244,247,251,0.4)" : "#f4f7fb",
              flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              textShadow: won ? "0 0 18px rgba(255,215,0,0.25)" : "none",
            });

            return (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 16,
                background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
                borderLeft: `4px solid ${accent}`,
                padding: "12px 20px",
                opacity: done ? 0.7 : 1,
                boxShadow: live ? "0 0 14px rgba(255,107,0,0.4)" : "none",
              }}>
                <span style={{
                  fontSize: "0.58rem", fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
                  color: accent, minWidth: 128,
                }}>
                  {finalsLabel(m)}
                </span>
                <span style={{ ...name(aWon, bWon), textAlign: "right" }}>
                  {aWon && <span style={{ fontSize: "0.8rem", marginRight: 8 }}>🏆</span>}{m.slotA.teamName || "TBD"}
                </span>
                <span style={{
                  fontFamily: FONT_DISPLAY, fontSize: "1.1rem", color: "#f4f7fb",
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                  background: "rgba(255,255,255,0.06)", border: `1px solid ${PLATE_BORDER}`,
                  borderRadius: 8, padding: "4px 14px",
                }}>
                  {done || live ? m.slotA.score : "–"} : {done || live ? m.slotB.score : "–"}
                </span>
                <span style={name(bWon, aWon)}>
                  {m.slotB.teamName || "TBD"}{bWon && <span style={{ fontSize: "0.8rem", marginLeft: 8 }}>🏆</span>}
                </span>
                <span style={{
                  fontSize: "0.58rem", fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
                  minWidth: 64, textAlign: "right",
                  color: live ? "#FF6B00" : next ? GOLD : "rgba(244,247,251,0.4)",
                }}>
                  {live ? "● LIVE" : next ? "UP NEXT" : done ? "FINAL" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
