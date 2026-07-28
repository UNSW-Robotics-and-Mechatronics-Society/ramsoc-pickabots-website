import { getRecentResults } from "@/lib/db/overlayResults";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ count?: string }> };

/**
 * "Recent Results" screen — the counterpart to /overlay/upcoming: the last
 * few resolved matches, winner in gold, newest at the top:
 *   /overlay/results           (last 6)
 *   /overlay/results?count=8
 * Sized as a centered full-screen board for its own OBS scene ("Results").
 */
export default async function ResultsOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const count = Math.min(12, Math.max(1, parseInt(params.count ?? "6", 10) || 6));
  const results = await getRecentResults(count);

  return (
    <>
      <OverlayRefresh tables={["matches", "bracket_matches"]} intervalMs={3000} />
      <div style={{
        position: "fixed", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: FONT_BODY,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 700, maxWidth: "80vw" }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: "1.4rem", letterSpacing: 6,
            textTransform: "uppercase", textAlign: "center", color: "#f4f7fb",
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            borderBottom: `3px solid ${GOLD}`, padding: "14px 24px",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            Recent Results
          </div>

          {results.length === 0 && (
            <div style={{
              background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
              padding: "16px 24px", textAlign: "center",
              color: "rgba(244,247,251,0.6)", letterSpacing: 1,
            }}>
              No matches resolved yet — first results land here automatically
            </div>
          )}

          {results.map(r => {
            const meta = r.isExhibition
              ? { color: GOLD, label: "EXHIBITION" }
              : DIVISION_META[r.division];
            const leftWon = r.winnerSide === "left";
            const name = (n: string, won: boolean): React.CSSProperties => ({
              fontFamily: FONT_DISPLAY, fontSize: "1.15rem",
              color: won ? GOLD : "rgba(244,247,251,0.45)",
              flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              textShadow: won ? "0 0 18px rgba(255,215,0,0.25)" : "none",
            });
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 16,
                background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
                borderLeft: `4px solid ${meta.color}`,
                padding: "12px 20px",
              }}>
                <span style={{ ...name(r.left, leftWon), textAlign: "right" }}>
                  {leftWon && <span style={{ fontSize: "0.8rem", marginRight: 8 }}>🏆</span>}{r.left}
                </span>
                <span style={{
                  fontFamily: FONT_DISPLAY, fontSize: "1.2rem", color: "#f4f7fb",
                  fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                  background: "rgba(255,255,255,0.06)", border: `1px solid ${PLATE_BORDER}`,
                  borderRadius: 8, padding: "4px 14px",
                }}>
                  {r.scoreLeft ?? "–"} : {r.scoreRight ?? "–"}
                </span>
                <span style={name(r.right, !leftWon)}>
                  {r.right}{!leftWon && <span style={{ fontSize: "0.8rem", marginLeft: 8 }}>🏆</span>}
                </span>
                <span style={{
                  fontSize: "0.58rem", fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
                  color: meta.color, minWidth: 92, textAlign: "right",
                }}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
