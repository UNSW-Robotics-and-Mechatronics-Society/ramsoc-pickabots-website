import { getBracketState } from "@/lib/db/bracket";
import { getTeamsLeaderboard } from "@/lib/db/teamsLeaderboard";
import { countsTowardTotals } from "@/lib/schedule";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ top?: string }> };

/**
 * Day-stats / intermission panel: matches played + remaining per division,
 * and the top of the team leaderboard (RAM-coin backing, same ranking as the
 * public /leaderboard page):
 *   /overlay/stats           (top 8 teams)
 *   /overlay/stats?top=10
 * Sized for a centered card on the intermission scene.
 */
export default async function StatsOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const top = Math.min(16, Math.max(3, parseInt(params.top ?? "8", 10) || 8));

  const [bracket, leaderboard] = await Promise.all([getBracketState(), getTeamsLeaderboard()]);

  // One definition of "a match", shared with the admin KPI bar and
  // /overlay/kpi — see countsTowardTotals. "Remaining" counts everything not
  // yet resolved, including matches whose teams aren't decided yet.
  //
  // Exhibition bouts count, and land under the division on their row. That
  // field is vestigial for them (see BracketSide's 'exhibition' note), but it's
  // the only division they have, and putting them somewhere keeps the two
  // columns summing to the event-wide total the other two surfaces show.
  const countable = bracket.matches.filter(countsTowardTotals);
  const byDivision = (["standards", "open"] as const).map(d => {
    const ms = countable.filter(m => m.division === d);
    const played = ms.filter(m => m.status === "completed").length;
    return { division: d, played, remaining: ms.length - played };
  });

  const teams = leaderboard.filter(t => t.kind === "regular").slice(0, top);

  const statCell: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    padding: "12px 22px",
  };

  return (
    <>
      <OverlayRefresh
        tables={["bracket_matches", "bracket_schedule", "matches", "leaderboard_signal"]}
        intervalMs={4000}
      />
      <div style={{
        position: "fixed", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: FONT_BODY,
      }}>
        <div style={{
          display: "flex", flexDirection: "column", gap: 14, minWidth: 640,
        }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: "1.4rem", letterSpacing: 6,
            textTransform: "uppercase", textAlign: "center", color: "#f4f7fb",
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            borderBottom: `3px solid ${GOLD}`, padding: "14px 24px",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            Tournament Standings
          </div>

          {/* Played / remaining strip */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 12,
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`, padding: "6px 12px",
          }}>
            {byDivision.map(({ division, played, remaining }) => {
              const meta = DIVISION_META[division];
              return (
                <div key={division} style={{ display: "flex", alignItems: "center" }}>
                  <div style={statCell}>
                    <span style={{ fontSize: "0.55rem", letterSpacing: 2, textTransform: "uppercase", color: meta.color, fontWeight: 800 }}>
                      {meta.label}
                    </span>
                    <span style={{ display: "flex", gap: 18 }}>
                      <span style={{ textAlign: "center" }}>
                        <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.6rem", color: "#f4f7fb" }}>{played}</span>
                        <span style={{ display: "block", fontSize: "0.55rem", letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,247,251,0.55)" }}>Played</span>
                      </span>
                      <span style={{ textAlign: "center" }}>
                        <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.6rem", color: GOLD }}>{remaining}</span>
                        <span style={{ display: "block", fontSize: "0.55rem", letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,247,251,0.55)" }}>To play</span>
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leaderboard rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {teams.map((t, i) => {
              const meta = t.division ? DIVISION_META[t.division] : null;
              // Greyed on the same rule as the public board: knocked out, or
              // nobody has voted on them yet (those sort to the very bottom, so
              // they only reach this top-N slice on a quiet board).
              const greyed = t.eliminated || t.votes === 0;
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
                  borderLeft: `4px solid ${meta?.color ?? GOLD}`,
                  padding: "8px 16px",
                  opacity: greyed ? 0.55 : 1,
                }}>
                  <span style={{
                    fontFamily: FONT_DISPLAY, fontSize: "1rem", minWidth: 34,
                    color: i < 3 ? GOLD : "rgba(244,247,251,0.6)",
                  }}>
                    {i + 1}
                  </span>
                  <span style={{
                    fontFamily: FONT_DISPLAY, fontSize: "1.05rem", color: "#f4f7fb",
                    flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {t.name}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "rgba(244,247,251,0.7)", minWidth: 70, textAlign: "right" }}>
                    {t.wins}W–{t.losses}L
                  </span>
                  <span style={{
                    fontSize: "0.6rem", fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
                    color: greyed ? "rgba(255,255,255,0.45)" : (meta?.color ?? GOLD),
                    minWidth: 92, textAlign: "right",
                  }}>
                    {t.statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
