import { getBracketState } from "@/lib/db/bracket";
import { formatTime } from "@/lib/schedule";
import { type BracketMatch, type Division } from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ count?: string; division?: string }> };

type Upcoming = {
  match: BracketMatch;
  division: Division;
  ring: number;
  startMinute: number;
};

/**
 * "Up Next" side panel — the next few matches across every ring, in start
 * order, with ring assignments:
 *   /overlay/upcoming              (both divisions, next 5)
 *   /overlay/upcoming?count=4&division=open
 *
 * Skips completed/skipped matches and, per ring, the one currently playing
 * (that's the lower-third's job) — this list is what teams should be walking
 * to a ring for.
 */
export default async function UpcomingOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const count = Math.min(10, Math.max(1, parseInt(params.count ?? "5", 10) || 5));
  const only: Division | null =
    params.division === "open" ? "open" : params.division === "standards" ? "standards" : null;

  const bracket = await getBracketState();

  const upcoming: Upcoming[] = [];
  for (const division of (["standards", "open"] as Division[])) {
    if (only && division !== only) continue;
    const byId = new Map(bracket.matches.map(m => [m.id, m]));
    bracket.schedules[division].rings.forEach((ring, ringIdx) => {
      // Pending queue for this ring, in order; [0] is on the ring now — the
      // upcoming list starts at [1] (plus every later slot, so a long queue
      // on one ring can fill several rows).
      const pending = ring
        .map(e => ({ m: byId.get(e.matchId), startMinute: e.startMinute }))
        .filter((x): x is { m: BracketMatch; startMinute: number } =>
          !!x.m && x.m.status !== "completed" && x.m.status !== "skipped");
      for (const { m, startMinute } of pending.slice(1)) {
        upcoming.push({ match: m, division, ring: ringIdx + 1, startMinute });
      }
    });
  }
  upcoming.sort((a, b) => a.startMinute - b.startMinute || a.ring - b.ring);
  const rows = upcoming.slice(0, count);

  return (
    <>
      <OverlayRefresh tables={["bracket_matches", "bracket_schedule"]} />
      <div style={{
        position: "fixed", top: "6vh", right: "3vw",
        display: "flex", flexDirection: "column", gap: 8,
        fontFamily: FONT_BODY, minWidth: 420, maxWidth: 520,
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: "1.1rem", letterSpacing: 4,
          textTransform: "uppercase", color: "#f4f7fb",
          background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
          borderBottom: `3px solid ${GOLD}`,
          padding: "10px 20px", textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}>
          Up Next
        </div>

        {rows.length === 0 && (
          <div style={{
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            padding: "12px 20px", color: "rgba(244,247,251,0.6)",
            fontSize: "0.95rem", letterSpacing: 1,
          }}>
            No more matches scheduled
          </div>
        )}

        {rows.map(({ match, division, ring, startMinute }) => {
          const meta = DIVISION_META[division];
          const a = match.slotA.teamName || "TBD";
          const b = match.slotB.teamName || "TBD";
          return (
            <div key={match.id} style={{
              display: "flex", alignItems: "center", gap: 14,
              background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
              borderLeft: `4px solid ${meta.color}`,
              padding: "10px 16px",
            }}>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                minWidth: 64,
              }}>
                <span style={{ color: GOLD, fontSize: "0.85rem", fontWeight: 800 }}>
                  {formatTime(startMinute)}
                </span>
                <span style={{
                  color: meta.color, fontSize: "0.6rem", fontWeight: 800,
                  letterSpacing: 2, textTransform: "uppercase",
                }}>
                  Ring {ring}
                </span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontSize: "1.05rem", color: "#f4f7fb",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {a} <span style={{ color: "rgba(255,255,255,0.4)" }}>vs</span> {b}
                </div>
                <div style={{
                  fontSize: "0.6rem", letterSpacing: 2, textTransform: "uppercase",
                  color: "rgba(244,247,251,0.55)",
                }}>
                  {meta.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
