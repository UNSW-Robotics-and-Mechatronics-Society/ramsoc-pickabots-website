import { getBracketState, type BracketState } from "@/lib/db/bracket";
import { getTeamsLeaderboard } from "@/lib/db/teamsLeaderboard";
import { ringLiveView, formatTime } from "@/lib/schedule";
import {
  type BracketMatch, type Division,
  wbRoundsFor, lbRoundsFor, wbRoundLabel, lbRoundLabel,
} from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

const DIVISIONS: Division[] = ["standards", "open"];

/** This page paints its own solid ground — it's an opaque browser source
 * ("bracket cam"), not a transparent overlay composited over camera. The
 * shared /overlay layout still forces html/body transparent for the whole
 * route group, so this wrapper covers it back over. */
const GROUND: React.CSSProperties = {
  position: "fixed", inset: 0, overflowY: "auto",
  background:
    "radial-gradient(1200px 700px at 15% -10%, rgba(255,107,0,0.10), transparent 60%)," +
    "radial-gradient(1200px 700px at 90% 0%, rgba(76,255,0,0.08), transparent 55%)," +
    "#06080b",
  fontFamily: FONT_BODY,
  color: "#f4f7fb",
};

function stageLabel(m: BracketMatch, teamCount: Record<Division, number>): string {
  const n = teamCount[m.division] as 4 | 8 | 16 | 32 | 64;
  if (m.side === "winners") return wbRoundLabel(m.round, wbRoundsFor(n));
  if (m.side === "losers") return lbRoundLabel(m.round, lbRoundsFor(n));
  if (m.side === "finals-semi") return "Finals Semi";
  if (m.side === "finals-final") return "Grand Final";
  if (m.side === "finals-third") return "3rd Place";
  return "Exhibition";
}

type OrderRow = { match: BracketMatch; division: Division; ring: number; startMinute: number };

/** Every scheduled bracket match across both divisions, in start order — the
 * schedule (not the round tree) is the source of truth for "what's next",
 * same rule as /overlay/upcoming and /overlay/board. */
function orderOfPlay(bracket: BracketState): OrderRow[] {
  const byId = new Map(bracket.matches.map(m => [m.id, m]));
  const rows: OrderRow[] = [];
  for (const division of DIVISIONS) {
    bracket.schedules[division].rings.forEach((ring, ringIdx) => {
      for (const e of ring) {
        const m = byId.get(e.matchId);
        if (m) rows.push({ match: m, division, ring: ringIdx + 1, startMinute: e.startMinute });
      }
    });
  }
  rows.sort((a, b) => a.startMinute - b.startMinute || a.ring - b.ring);
  return rows;
}

/**
 * Finals Day hub — a single opaque page for a venue screen, a stream-overlay
 * "info" scene, or a browser tab someone checks on their phone:
 *   /overlay/finals-day
 * Shows what's live right now (per ring, per division), the day's running
 * order with completed/current/upcoming state, and a standings snapshot.
 * Unlike the rest of /overlay/*, this is meant to stand alone on camera, so
 * it paints a solid ground rather than compositing transparently.
 */
export default async function FinalsDayOverlay() {
  const [bracket, teamsLeaderboard] = await Promise.all([getBracketState(), getTeamsLeaderboard()]);

  const liveRings = DIVISIONS.flatMap(division => {
    const view = ringLiveView(bracket.matches, bracket.schedules[division]);
    return view
      .map((entry, i) => ({ division, ring: i + 1, ...entry }))
      .filter(e => e.active || e.next);
  });

  const order = orderOfPlay(bracket);
  // Centre the window on "now": the last couple of finished bouts plus a
  // healthy run of what's coming, so the list stays a screenful rather than
  // the whole day's card.
  const liveIds = new Set(liveRings.map(e => e.active?.id).filter(Boolean));
  const lastDoneIdx = order.map(r => r.match.status === "completed").lastIndexOf(true);
  const windowStart = Math.max(0, lastDoneIdx - 1);
  const rows = order.slice(windowStart, windowStart + 9);

  const standings = DIVISIONS.map(division => ({
    division,
    teams: teamsLeaderboard
      .filter(t => t.kind === "regular" && t.division === division && t.status !== "unentered")
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
      .slice(0, 4),
  }));

  const card: React.CSSProperties = {
    background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`, borderRadius: 8,
  };

  return (
    <>
      <OverlayRefresh tables={["bracket_matches", "bracket_schedule", "votes", "matches", "teams"]} intervalMs={4000} />
      <div style={GROUND}>
        <div style={{
          maxWidth: 1400, margin: "0 auto", padding: "40px 28px 80px",
          display: "flex", flexDirection: "column", gap: 24,
        }}>
          {/* Hero */}
          <div style={{
            ...card, borderBottom: `3px solid ${GOLD}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 20, padding: "26px 30px",
          }}>
            <div>
              <div style={{
                fontFamily: FONT_DISPLAY, fontSize: "1.8rem", letterSpacing: 4, textTransform: "uppercase",
                textShadow: "0 2px 10px rgba(0,0,0,0.8)",
              }}>
                Superbots 2026 — Finals Day
              </div>
              <div style={{ marginTop: 6, fontSize: "0.8rem", letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,247,251,0.55)" }}>
                RAMSoc Pickabots
              </div>
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: "0.8rem", letterSpacing: 1.5, color: "rgba(244,247,251,0.6)" }}>
              <span>{liveRings.filter(e => e.active).length} ring{liveRings.filter(e => e.active).length === 1 ? "" : "s"} live</span>
              <span>·</span>
              <span>{order.filter(r => r.match.status !== "completed" && r.match.status !== "skipped").length} matches remaining</span>
            </div>
          </div>

          {/* Live rings */}
          {liveRings.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              {liveRings.map(({ division, ring, active, next }) => {
                const meta = DIVISION_META[division];
                const live = !!active;
                return (
                  <div key={`${division}-${ring}`} style={{ ...card, overflow: "hidden" }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 16px", fontSize: "0.7rem", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700,
                      background: live ? `${meta.color}29` : "rgba(255,255,255,0.03)",
                      color: live ? meta.color : "rgba(244,247,251,0.6)",
                    }}>
                      <span>
                        <span style={{
                          display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 6,
                          background: live ? meta.color : "rgba(244,247,251,0.3)",
                          boxShadow: live ? `0 0 8px ${meta.color}` : "none",
                        }} />
                        Ring {ring} · {meta.label}
                      </span>
                      <span>{live ? "Live" : "Between bouts"}</span>
                    </div>
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                      {active ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {active.slotA.teamName || "TBD"}
                          </span>
                          <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.15rem", color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                            {active.slotA.score}
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.7rem", letterSpacing: 1.5, color: "rgba(244,247,251,0.4)", textAlign: "center" }}>VS</div>
                      )}
                      {active && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {active.slotB.teamName || "TBD"}
                          </span>
                          <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.15rem", color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                            {active.slotB.score}
                          </span>
                        </div>
                      )}
                      {next && (
                        <div style={{
                          fontSize: "0.72rem", color: "rgba(244,247,251,0.55)",
                          borderTop: `1px solid ${PLATE_BORDER}`, paddingTop: 10, marginTop: 2,
                        }}>
                          Up next: <span style={{ color: "#f4f7fb" }}>{next.slotA.teamName || "TBD"} vs {next.slotB.teamName || "TBD"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20, alignItems: "start" }}>
            {/* Order of play */}
            <div style={{ ...card, padding: "22px 24px" }}>
              <div style={{
                fontFamily: FONT_DISPLAY, fontSize: "0.85rem", letterSpacing: 3, textTransform: "uppercase",
                color: "rgba(244,247,251,0.55)", marginBottom: 16,
              }}>
                Order of Play
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {rows.map(({ match, division, startMinute }) => {
                  const meta = DIVISION_META[division];
                  const done = match.status === "completed" || match.status === "skipped";
                  const now = liveIds.has(match.id);
                  return (
                    <div key={match.id} style={{
                      display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 14, alignItems: "center",
                      padding: "10px 8px", borderBottom: `1px solid ${PLATE_BORDER}`,
                      opacity: done ? 0.45 : 1,
                      background: now ? `${meta.color}14` : "transparent",
                      borderRadius: now ? 6 : 0,
                    }}>
                      <span style={{ fontFamily: FONT_DISPLAY, fontSize: "0.9rem", color: now ? meta.color : GOLD, fontVariantNumeric: "tabular-nums" }}>
                        {formatTime(startMinute)}
                      </span>
                      <span style={{ fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{
                          fontSize: "0.6rem", letterSpacing: 1.5, marginRight: 8, padding: "2px 7px", borderRadius: 4,
                          fontWeight: 700, background: `${meta.color}2e`, color: meta.color,
                        }}>
                          {meta.label}
                        </span>
                        {match.slotA.teamName || "TBD"} <span style={{ color: "rgba(255,255,255,0.4)" }}>vs</span> {match.slotB.teamName || "TBD"}
                      </span>
                      <span style={{ fontSize: "0.68rem", letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(244,247,251,0.5)", whiteSpace: "nowrap" }}>
                        {stageLabel(match, bracket.teamCounts)}
                      </span>
                    </div>
                  );
                })}
                {rows.length === 0 && (
                  <div style={{ padding: "12px 8px", color: "rgba(244,247,251,0.5)", fontSize: "0.9rem" }}>
                    No matches scheduled
                  </div>
                )}
              </div>
            </div>

            {/* Standings snapshot */}
            <div style={{ ...card, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{
                fontFamily: FONT_DISPLAY, fontSize: "0.85rem", letterSpacing: 3, textTransform: "uppercase",
                color: "rgba(244,247,251,0.55)",
              }}>
                Standings Snapshot
              </div>
              {standings.map(({ division, teams }) => {
                const meta = DIVISION_META[division];
                return (
                  <div key={division}>
                    <div style={{ fontSize: "0.72rem", letterSpacing: 2, textTransform: "uppercase", color: meta.color, marginBottom: 8 }}>
                      {meta.label}
                    </div>
                    {teams.map((t, i) => (
                      <div key={t.id} style={{
                        display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center",
                        padding: "5px 0", fontSize: "0.88rem",
                      }}>
                        <span style={{ color: "rgba(244,247,251,0.5)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        <span style={{ color: "rgba(244,247,251,0.55)", fontSize: "0.78rem", fontVariantNumeric: "tabular-nums" }}>
                          {t.wins}–{t.losses}
                        </span>
                      </div>
                    ))}
                    {teams.length === 0 && (
                      <div style={{ fontSize: "0.82rem", color: "rgba(244,247,251,0.45)" }}>No teams drawn yet</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
