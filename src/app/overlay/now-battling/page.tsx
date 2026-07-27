import { getBracketState } from "@/lib/db/bracket";
import { getObsState } from "@/lib/db/obs";
import { getOddsForBracketMatch, type OverlayOdds } from "@/lib/db/overlayOdds";
import { ringLiveView, MAX_RINGS } from "@/lib/schedule";
import { type Division } from "@/lib/mock-data";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { DIVISION_META, GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

// Every render must reflect the current bracket/override — the realtime
// refresh below re-runs this server component on each change.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ring?: string; division?: string }> };

/**
 * "Now Battling" lower-third — one per ring scene in OBS:
 *   /overlay/now-battling?ring=3            (standard division, ring 3)
 *   /overlay/now-battling?ring=1&division=open
 *
 * Shows the match currently ON that ring (bracket-derived, same rule as the
 * admin/public views), the score, and the up-next line for the same ring.
 * The control panel's manual override replaces the names when active for
 * this ring (or for all rings). Renders nothing at all when the ring is idle
 * and no override applies — an empty transparent source, not an empty box.
 */
export default async function NowBattlingOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const ring = Math.min(MAX_RINGS, Math.max(1, parseInt(params.ring ?? "1", 10) || 1));
  const division: Division = params.division === "open" ? "open" : "standards";

  const [obs, bracket] = await Promise.all([getObsState(), getBracketState()]);
  const view = ringLiveView(bracket.matches, bracket.schedules[division]);
  const entry = view[ring - 1] ?? { active: null, next: null };

  const overridden = obs.overrideActive && (obs.overrideRing === 0 || obs.overrideRing === ring);

  // Live parimutuel odds for the on-ring match. Only for real bracket matches
  // (an override is free text — there's nothing to bet on), and quietly absent
  // when the match has no voting row yet.
  const odds: OverlayOdds | null =
    !overridden && entry.active ? await getOddsForBracketMatch(entry.active.id) : null;
  const left = overridden ? (obs.overrideLeft || "TBD") : entry.active?.slotA.teamName;
  const right = overridden ? (obs.overrideRight || "TBD") : entry.active?.slotB.teamName;
  const scoreA = !overridden ? entry.active?.slotA.score : undefined;
  const scoreB = !overridden ? entry.active?.slotB.score : undefined;
  const target = !overridden ? entry.active?.targetScore : undefined;

  const meta = DIVISION_META[division];
  const show = overridden || !!entry.active;

  const namePlate: React.CSSProperties = {
    background: PLATE_BG,
    border: `1px solid ${PLATE_BORDER}`,
    borderBottom: `3px solid ${meta.color}`,
    padding: "14px 34px",
    fontFamily: FONT_DISPLAY,
    fontSize: "2.1rem",
    lineHeight: 1.1,
    color: "#f4f7fb",
    whiteSpace: "nowrap",
    maxWidth: "38vw",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
  };

  const scoreChip: React.CSSProperties = {
    fontFamily: FONT_DISPLAY,
    fontSize: "2.4rem",
    color: GOLD,
    background: PLATE_BG,
    border: `1px solid ${PLATE_BORDER}`,
    padding: "8px 22px",
    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
  };

  return (
    <>
      {/* `votes` makes the odds move bet-by-bet; the trailing throttle in
          useRealtimeRefresh keeps a betting frenzy at one refresh per tick. */}
      <OverlayRefresh tables={["pickabots_obs_state", "bracket_matches", "bracket_schedule", "matches", "votes"]} />
      {show && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: "4vh",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          fontFamily: FONT_BODY,
        }}>
          {/* Kicker: NOW BATTLING · STANDARD · RING 3 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            padding: "6px 18px", borderRadius: 999,
            fontSize: "0.85rem", fontWeight: 800, letterSpacing: 4, textTransform: "uppercase",
            color: "rgba(244,247,251,0.9)",
          }}>
            <span style={{ color: meta.color }}>●</span>
            Now Battling
            <span style={{ color: "rgba(255,255,255,0.35)" }}>·</span>
            <span style={{ color: meta.color }}>{meta.label}</span>
            <span style={{ color: "rgba(255,255,255,0.35)" }}>·</span>
            <span style={{ color: GOLD }}>Ring {ring}</span>
          </div>

          {/* Name plates + score */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
            <div style={{ ...namePlate, clipPath: "polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)", textAlign: "right", paddingRight: 44 }}>
              {left}
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, zIndex: 1,
              margin: "0 -8px",
            }}>
              {typeof scoreA === "number" && <span style={scoreChip}>{scoreA}</span>}
              <span style={{
                fontFamily: FONT_DISPLAY, fontSize: "1.3rem", color: meta.color,
                background: PLATE_BG, border: `2px solid ${meta.color}`,
                borderRadius: 999, padding: "12px 14px",
                textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              }}>
                VS
              </span>
              {typeof scoreB === "number" && <span style={scoreChip}>{scoreB}</span>}
            </div>
            <div style={{ ...namePlate, clipPath: "polygon(16px 0, 100% 0, 100% 100%, 0 100%)", paddingLeft: 44 }}>
              {right}
            </div>
          </div>

          {/* Live betting odds — pool split bar with payout multipliers.
              Hidden entirely when there's no voting row for this match. */}
          {odds && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
              padding: "8px 18px", borderRadius: 10,
              fontVariantNumeric: "tabular-nums",
            }}>
              <span style={{
                fontFamily: FONT_DISPLAY, fontSize: "1.1rem", color: meta.color,
                minWidth: 74, textAlign: "right", textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              }}>
                {odds.multLeft !== null ? `${odds.multLeft.toFixed(2)}×` : "—"}
              </span>
              <div style={{ width: 260 }}>
                <div style={{
                  display: "flex", height: 10, borderRadius: 999, overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.25)",
                }}>
                  <div style={{ width: `${odds.pctLeft}%`, background: meta.color, transition: "width 0.6s ease" }} />
                  <div style={{ width: `${odds.pctRight}%`, background: GOLD, transition: "width 0.6s ease" }} />
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", marginTop: 3,
                  fontSize: "0.6rem", letterSpacing: 1.5, textTransform: "uppercase",
                  color: "rgba(244,247,251,0.7)",
                }}>
                  <span>{odds.pctLeft}%</span>
                  <span>
                    {odds.totalPool.toLocaleString()} ⛁ · {odds.votes} bet{odds.votes === 1 ? "" : "s"}
                    {odds.votingOpen ? " · voting open" : ""}
                  </span>
                  <span>{odds.pctRight}%</span>
                </div>
              </div>
              <span style={{
                fontFamily: FONT_DISPLAY, fontSize: "1.1rem", color: GOLD,
                minWidth: 74, textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              }}>
                {odds.multRight !== null ? `${odds.multRight.toFixed(2)}×` : "—"}
              </span>
            </div>
          )}

          {/* First-to-N + up next */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            fontSize: "0.8rem", letterSpacing: 2, textTransform: "uppercase",
            color: "rgba(244,247,251,0.75)",
            background: "rgba(6,8,11,0.7)", border: `1px solid ${PLATE_BORDER}`,
            padding: "5px 16px", borderRadius: 999,
          }}>
            {typeof target === "number" && target > 0 && <span>First to {target}</span>}
            {entry.next && !overridden && (
              <span>
                Up next: <span style={{ color: GOLD }}>
                  {entry.next.slotA.teamName} vs {entry.next.slotB.teamName}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
