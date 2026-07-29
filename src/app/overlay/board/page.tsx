import { getBracketState, type BracketState } from "@/lib/db/bracket";
import { getTeamsLeaderboard } from "@/lib/db/teamsLeaderboard";
import { getWagerStats } from "@/lib/db/overlayOdds";
import { formatTime } from "@/lib/schedule";
import { type BracketMatch, type Division } from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

/**
 * The info board — a single page carrying the multiview's fourth quadrant
 * (design signed off via the reviewed mock):
 *   row 1: next three matches per division
 *   row 2: division progress bars · crowd-favourites bars · wagered hero +
 *          cumulative sparkline
 * Replaces the previous composite of four pixel-cropped browser sources, so
 * the quadrant survives page redesigns. Laid out on the full 1920×1080
 * canvas (it renders scaled to whatever box OBS puts it in).
 *
 * Chart colour rules (validated): division orange/green only for series;
 * gold is reserved for the hero number and the single-series sparkline —
 * gold-vs-green is indistinguishable for deutan viewers, so gold never
 * appears as a categorical bar.
 */

// Same rule as /overlay/upcoming: per ring, everything pending except the
// bout currently on the ring.
function nextMatches(bracket: BracketState, division: Division, count: number) {
  const byId = new Map(bracket.matches.map(m => [m.id, m]));
  const out: { match: BracketMatch; ring: number; startMinute: number }[] = [];
  bracket.schedules[division].rings.forEach((ring, ringIdx) => {
    const pending = ring
      .map(e => ({ m: byId.get(e.matchId), startMinute: e.startMinute }))
      .filter((x): x is { m: BracketMatch; startMinute: number } =>
        !!x.m && x.m.status !== "completed" && x.m.status !== "skipped");
    for (const { m, startMinute } of pending.slice(1)) {
      out.push({ match: m, ring: ringIdx + 1, startMinute });
    }
  });
  out.sort((a, b) => a.startMinute - b.startMinute || a.ring - b.ring);
  return out.slice(0, count);
}

export default async function BoardOverlay() {
  const [bracket, leaderboard, wagers] = await Promise.all([
    getBracketState(), getTeamsLeaderboard(), getWagerStats(),
  ]);

  // Progress per division — same "real games" definition as /overlay/stats.
  const real = bracket.matches.filter(m => m.side !== "wildcard" && m.side !== "exhibition");
  const progress = (["standards", "open"] as Division[]).map(d => {
    const ms = real.filter(m => m.division === d);
    const played = ms.filter(m => m.status === "completed").length;
    const skipped = ms.filter(m => m.status === "skipped").length;
    const total = ms.length - skipped;
    return { division: d, played, toPlay: total - played, pct: total > 0 ? Math.round((played / total) * 100) : 0 };
  });

  // Estimated finish — same derivation as /overlay/kpi.
  let lastStart = -1, slotMinutes = 0;
  for (const sched of [...Object.values(bracket.schedules), bracket.exhibitionSchedule]) {
    for (const ring of sched.rings) {
      const last = ring[ring.length - 1];
      if (last && last.startMinute > lastStart) { lastStart = last.startMinute; slotMinutes = sched.matchMinutes; }
    }
  }
  const estFinish = lastStart >= 0 ? formatTime(lastStart + slotMinutes) : null;

  // Crowd favourites: top 5 regular teams by coins backed.
  const favourites = leaderboard
    .filter(t => t.kind === "regular" && t.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 5);
  const maxTokens = favourites[0]?.tokens ?? 1;

  // Sparkline geometry (server-rendered SVG; 560×148 viewBox).
  const series = wagers.cumulativeByMatch;
  const sparkW = 560, sparkH = 148;
  const maxCum = series[series.length - 1] || 1;
  const points = series.length > 1
    ? series.map((v, i) => `${(8 + (i / (series.length - 1)) * (sparkW - 24)).toFixed(1)},${(sparkH - 8 - (v / maxCum) * (sparkH - 24)).toFixed(1)}`)
    : [];
  const lastPoint = points[points.length - 1]?.split(",").map(Number);

  const upNext = {
    standards: nextMatches(bracket, "standards", 3),
    open: nextMatches(bracket, "open", 3),
  };

  const labStyle: React.CSSProperties = {
    fontSize: "1.05rem", fontWeight: 800, letterSpacing: 4,
    textTransform: "uppercase", color: "rgba(244,247,251,0.55)",
  };
  const card: React.CSSProperties = {
    background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
    padding: "22px 26px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0,
  };

  return (
    <>
      <OverlayRefresh tables={["bracket_matches", "bracket_schedule", "votes", "matches"]} intervalMs={4000} />
      <div style={{
        position: "fixed", inset: 0, padding: 26,
        display: "grid", gridTemplateRows: "490px 1fr", gap: 20,
        fontFamily: FONT_BODY,
      }}>
        {/* ── row 1: up next per division ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {(["standards", "open"] as Division[]).map(d => {
            const meta = DIVISION_META[d];
            return (
              <div key={d} style={{ ...card, padding: 0, gap: 10 }}>
                <div style={{
                  fontFamily: FONT_DISPLAY, fontSize: "1.45rem", letterSpacing: 8,
                  textTransform: "uppercase", padding: "16px 28px",
                  borderBottom: `5px solid ${GOLD}`,
                }}>
                  Up Next
                </div>
                {upNext[d].length === 0 && (
                  <div style={{ padding: "20px 28px", color: "rgba(244,247,251,0.5)", fontSize: "1.2rem" }}>
                    No more {meta.label.toLowerCase()} matches scheduled
                  </div>
                )}
                {upNext[d].map(({ match, ring, startMinute }) => (
                  <div key={match.id} style={{
                    display: "flex", alignItems: "center", gap: 20,
                    borderLeft: `7px solid ${meta.color}`,
                    padding: "12px 24px", margin: "0 12px",
                    background: "rgba(255,255,255,0.03)",
                  }}>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 104 }}>
                      <span style={{ color: GOLD, fontSize: "1.3rem", fontWeight: 800 }}>{formatTime(startMinute)}</span>
                      <span style={{ fontSize: "0.95rem", fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", color: meta.color }}>
                        Ring {ring}
                      </span>
                    </span>
                    <span style={{
                      fontFamily: FONT_DISPLAY, fontSize: "1.5rem", minWidth: 0,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {match.slotA.teamName || "TBD"} <span style={{ color: "rgba(255,255,255,0.4)" }}>vs</span> {match.slotB.teamName || "TBD"}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── row 2: graphs ── */}
        <div style={{ display: "grid", gridTemplateColumns: "450px 1fr 600px", gap: 20 }}>

          {/* ① progress */}
          <div style={card}>
            <div style={labStyle}>Tournament progress</div>
            {progress.map(p => {
              const meta = DIVISION_META[p.division];
              return (
                <div key={p.division} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: 3, textTransform: "uppercase", color: meta.color }}>
                      {meta.label}
                    </span>
                    <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.7rem" }}>{p.pct}%</span>
                  </div>
                  <div style={{ height: 22, borderRadius: 8, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                    <div style={{ width: `${p.pct}%`, height: "100%", background: meta.color, borderRadius: "0 8px 8px 0" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontVariantNumeric: "tabular-nums" }}>
                    <span>{p.played} played</span>
                    <span style={{ color: "rgba(244,247,251,0.55)" }}>{p.toPlay} to play</span>
                  </div>
                </div>
              );
            })}
            {estFinish && (
              <div style={{ marginTop: "auto", fontSize: "0.95rem", letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,247,251,0.55)" }}>
                Est. finish <span style={{ fontFamily: FONT_DISPLAY, color: GOLD, fontSize: "1.5rem", marginLeft: 10 }}>{estFinish}</span>
              </div>
            )}
          </div>

          {/* ② crowd favourites */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={labStyle}>Crowd favourites · most coins backed</span>
              <span style={{ display: "flex", gap: 22, fontSize: "0.9rem", letterSpacing: 1.5 }}>
                <span><span style={{ color: DIVISION_META.standards.color }}>▮</span> Standard</span>
                <span><span style={{ color: DIVISION_META.open.color }}>▮</span> Open</span>
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, justifyContent: "center" }}>
              {favourites.length === 0 && (
                <div style={{ color: "rgba(244,247,251,0.5)", fontSize: "1.2rem" }}>No bets placed yet</div>
              )}
              {favourites.map(t => {
                const meta = t.division ? DIVISION_META[t.division] : { color: GOLD };
                return (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 16, alignItems: "center" }}>
                    <span style={{
                      fontSize: "1.15rem", textAlign: "right",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t.name}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <div style={{
                        width: `${Math.max(3, (t.tokens / maxTokens) * 78)}%`, height: 22,
                        background: meta.color, borderRadius: "0 8px 8px 0",
                      }} />
                      <span style={{ fontSize: "1.05rem", fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {t.tokens.toLocaleString()} ⛁
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ③ coins wagered hero + sparkline */}
          <div style={card}>
            <div style={labStyle}>Coins wagered today</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: "3.2rem", lineHeight: 1.05, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
              {wagers.totalWagered.toLocaleString()} ⛁
            </div>
            {points.length > 1 && (
              <>
                <svg viewBox={`0 0 ${sparkW} ${sparkH}`} width="100%" role="img" aria-label="Cumulative coins wagered across the day's matches">
                  <line x1="0" y1={sparkH - 4} x2={sparkW} y2={sparkH - 4} stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                  <polygon points={`${points.join(" ")} ${lastPoint![0]},${sparkH - 4} 8,${sparkH - 4}`} fill="rgba(255,215,0,0.08)" />
                  <polyline points={points.join(" ")} fill="none" stroke={GOLD} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={lastPoint![0]} cy={lastPoint![1]} r="8" fill={GOLD} stroke="#0a0d12" strokeWidth="4" />
                </svg>
                <div style={{ fontSize: "0.85rem", letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,247,251,0.55)", marginTop: -6 }}>
                  Cumulative · by match
                </div>
              </>
            )}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "0.95rem", letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,247,251,0.55)" }}>Players betting</span>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.5rem" }}>{wagers.bettors}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "0.95rem", letterSpacing: 2, textTransform: "uppercase", color: "rgba(244,247,251,0.55)" }}>Biggest pool</span>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: "1.5rem" }}>{wagers.biggestPool.toLocaleString()} ⛁</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
