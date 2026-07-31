import { getBracketState } from "@/lib/db/bracket";
import { getWagerTotals } from "@/lib/db/overlayOdds";
import { isFinalsMatch } from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import RamCoin from "@/components/RamCoin";
import { GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ side?: string }> };

type Kpi = { label: string; value: React.ReactNode; sub?: string; accent?: boolean };

/**
 * KPI side banner — day-at-a-glance numbers stacked down one edge, designed
 * to sit over a camera scene without fighting the lower-third (which owns
 * the bottom of frame):
 *   /overlay/kpi              (right edge)
 *   /overlay/kpi?side=left
 *
 * Matches played/remaining (Finals Day matches only — the division prelim
 * rounds are long done by the time this ships), coins wagered and bettor
 * count. Transparent like the other overlays; hides itself entirely if
 * there are no finals matches.
 */
export default async function KpiOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const side = params.side === "left" ? "left" : "right";

  const [bracket, wagers] = await Promise.all([getBracketState(), getWagerTotals()]);

  // Finals Day: only the semis/bronze/final matches are still live — the
  // division prelim rounds this also-counted before are done, and including
  // them made "matches today" report a stale total.
  const finalsMatches = bracket.matches.filter(isFinalsMatch);
  const played = finalsMatches.filter(m => m.status === "completed").length;
  const remaining = finalsMatches.length - played;

  if (finalsMatches.length === 0) return null;

  const kpis: Kpi[] = [
    { label: "Matches today", value: `${played}`, sub: `of ${finalsMatches.length}` },
    { label: "Still to play", value: `${remaining}` },
    {
      label: "Coins wagered", accent: true,
      value: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {wagers.totalWagered.toLocaleString()} <RamCoin size={20} />
        </span>
      ),
    },
    { label: "Players voting", value: `${wagers.bettors}` },
  ];

  return (
    <>
      <OverlayRefresh
        tables={["bracket_matches", "bracket_schedule", "votes", "matches"]}
        intervalMs={4000}
      />
      <div style={{
        position: "fixed", top: "50%", transform: "translateY(-50%)",
        [side]: "2vw",
        display: "flex", flexDirection: "column", gap: 8,
        width: 230, fontFamily: FONT_BODY,
      } as React.CSSProperties}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "0.7rem", letterSpacing: 4,
          textTransform: "uppercase", textAlign: "center",
          color: "rgba(244,247,251,0.85)",
          background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
          borderBottom: `3px solid ${GOLD}`, padding: "8px 12px",
        }}>
          Sumobots Today
        </div>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            padding: "10px 14px",
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            <span style={{
              fontSize: "0.55rem", fontWeight: 800, letterSpacing: 2,
              textTransform: "uppercase", color: "rgba(244,247,251,0.55)",
            }}>
              {k.label}
            </span>
            <span style={{
              fontFamily: FONT_DISPLAY, fontSize: "1.5rem", lineHeight: 1.1,
              color: k.accent ? GOLD : "#f4f7fb",
              fontVariantNumeric: "tabular-nums",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}>
              {k.value}
              {k.sub && (
                <span style={{
                  fontFamily: FONT_BODY, fontSize: "0.7rem",
                  color: "rgba(244,247,251,0.5)", marginLeft: 6,
                }}>
                  {k.sub}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
