import { getLeaderboard } from "@/lib/db/leaderboard";
import OverlayRefresh from "@/components/obs/OverlayRefresh";
import { GOLD, PLATE_BG, PLATE_BORDER, FONT_DISPLAY, FONT_BODY } from "@/components/obs/overlayTheme";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ top?: string }> };

/**
 * Player leaderboard screen — the RAM-coin betting standings, the audience-
 * facing counterpart to /overlay/stats (which ranks TEAMS):
 *   /overlay/leaderboard          (top 10 players)
 *   /overlay/leaderboard?top=15
 * Sized as a full-screen board for its own OBS scene, to cut to between
 * matches. Subscribes to the same tables as the public leaderboard page, so
 * it moves when a game resolves — not on every bet (deliberate; see
 * lib/db/leaderboard.ts).
 */
export default async function LeaderboardOverlay({ searchParams }: Props) {
  const params = await searchParams;
  const top = Math.min(20, Math.max(3, parseInt(params.top ?? "10", 10) || 10));

  const players = (await getLeaderboard()).slice(0, top);
  // Two balanced columns once the list is long enough to feel like a wall.
  const twoCol = players.length > 8;
  const split = twoCol ? Math.ceil(players.length / 2) : players.length;
  const columns = twoCol ? [players.slice(0, split), players.slice(split)] : [players];

  const medal = (i: number) => (i === 0 ? "#FFD700" : i === 1 ? "#C0C4CC" : i === 2 ? "#CD7F32" : null);

  return (
    <>
      <OverlayRefresh
        tables={["matches", "bracket_matches", "leaderboard_signal"]}
        intervalMs={4000}
      />
      <div style={{
        position: "fixed", inset: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontFamily: FONT_BODY,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 640, maxWidth: "88vw" }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: "1.4rem", letterSpacing: 6,
            textTransform: "uppercase", textAlign: "center", color: "#f4f7fb",
            background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
            borderBottom: `3px solid ${GOLD}`, padding: "14px 24px",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            Player Leaderboard
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {columns.map((col, ci) => (
              <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                {col.map((p, i) => {
                  const rank = ci * split + i + 1;
                  const m = medal(rank - 1);
                  return (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      background: PLATE_BG, border: `1px solid ${PLATE_BORDER}`,
                      borderLeft: `4px solid ${m ?? "rgba(255,255,255,0.25)"}`,
                      padding: "8px 16px",
                    }}>
                      <span style={{
                        fontFamily: FONT_DISPLAY, fontSize: "1rem", minWidth: 34,
                        color: m ?? "rgba(244,247,251,0.6)",
                      }}>
                        {rank}
                      </span>
                      <span style={{
                        fontFamily: FONT_DISPLAY, fontSize: "1.05rem", color: "#f4f7fb",
                        flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {p.name}
                      </span>
                      <span style={{
                        fontSize: "0.75rem", color: "rgba(244,247,251,0.7)",
                        minWidth: 64, textAlign: "right", fontVariantNumeric: "tabular-nums",
                      }}>
                        {p.wins}W–{p.losses}L
                      </span>
                      <span style={{
                        fontFamily: FONT_DISPLAY, fontSize: "1.05rem", color: GOLD,
                        minWidth: 90, textAlign: "right", fontVariantNumeric: "tabular-nums",
                        textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                      }}>
                        {p.tokens.toLocaleString()} ⛁
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{
            textAlign: "center", fontSize: "0.65rem", letterSpacing: 3,
            textTransform: "uppercase", color: "rgba(244,247,251,0.6)",
            background: "rgba(6,8,11,0.7)", border: `1px solid ${PLATE_BORDER}`,
            padding: "6px 16px", borderRadius: 999, alignSelf: "center",
          }}>
            Vote with your RAM coins at pickabots.ramsocunsw.org
          </div>
        </div>
      </div>
    </>
  );
}
