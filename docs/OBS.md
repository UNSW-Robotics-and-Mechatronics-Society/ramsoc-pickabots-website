# OBS Streaming Companion — Setup Guide

The live-stream production stack for the sumobots tournament: a phone control
panel, on-stream overlays, and a relay agent that connects OBS to both.

```
 Phone (/control) ──► Vercel API ──► pickabots_obs_commands ─┐
                                                             │ Supabase Realtime
 OBS PC:  relay agent ◄──────────────────────────────────────┘
             │  ws://127.0.0.1:4455 (obs-websocket)
             ▼
            OBS ──composites──► /overlay/* browser sources ◄── Supabase Realtime
```

## 1. One-time database setup

Paste `supabase/migrations/0022_obs_companion.sql` into
**Supabase Dashboard → SQL Editor → Run**. (Same procedure as every other
migration in this repo.)

## 2. OBS PC setup

1. **Enable the WebSocket server**: OBS → **Tools → WebSocket Server Settings**
   → tick *Enable WebSocket server*. Note the port (4455) and copy the
   password (*Show Connect Info*).
2. **Run the relay agent** (needs Node 18+):
   ```bash
   cd relay
   npm install
   copy .env.example .env   # fill in Supabase URL + service role key + OBS password
   npm start
   ```
   Leave the window open. The `/control` page's "Relay" light turns green
   within ~10 seconds. The relay reconnects on its own if OBS restarts or the
   network blips.
3. *(Optional but recommended)* **Settings → Output → Replay Buffer** — enable
   it so the panel's instant-replay button has something to save.

### Why no Tailscale Funnel for the control path

The networking spec floats exposing obs-websocket via Tailscale Funnel, with a
custom outbound relay as the recommended alternative. **The relay agent above
IS that recommended approach**: it makes only outbound connections (Supabase
Realtime over HTTPS/WSS), so obs-websocket stays bound to localhost, nothing
is exposed to the public internet even indirectly, and no Funnel/WS-upgrade
behaviour needs verifying. Tailscale is still used — but only for the
machine-to-machine RTMP ingest below, not for control.

## 2b. Multi-room ingest (Tailscale + MediaMTX)

The remote rooms push RTMP over the tailnet to MediaMTX on the main OBS PC
(university wifi client isolation can't block it — Tailscale tunnels through).

**Main OBS PC:**
1. Install Tailscale, join the event tailnet, enable MagicDNS, name the
   device `main-obs-pc`.
2. Download MediaMTX (single binary) and drop `relay/mediamtx.yml` from this
   repo next to it — it defines the three ingest paths (`room2`, `room3`,
   `phone`) and turns on the local control API the relay agent uses for the
   panel's feed lights. Register it as a service so it starts on boot, e.g.
   with [NSSM](https://nssm.cc) or Task Scheduler → "At startup".
3. In OBS, add each remote feed as a **Media Source** reading
   `rtmp://localhost:1935/room2` (etc.) — localhost, not the tailnet name,
   since MediaMTX runs on the same machine.
4. The relay's `.env` already points `MEDIAMTX_API_URL` at
   `http://127.0.0.1:9997` — with that set, the control panel shows a
   receiving/offline light per room feed.

**Mac Mini (Room 2) / laptop (Room 3):** install Tailscale (same tailnet) and
OBS, add the capture-card sources, then Settings → Stream → Custom with server
`rtmp://main-obs-pc.<tailnet>.ts.net:1935/room2` (Mini) or `.../room3`
(laptop), stream key blank. Bitrate 2500–3500 Kbps, keyframe interval 2s.
No obs-websocket needed on these — they just push one continuous feed.

**Phone (Room 3):** Tailscale app on the same tailnet (battery optimisation
off), Larix Broadcaster pushing to
`rtmp://main-obs-pc.<tailnet>.ts.net:1935/phone` at 1500–2500 Kbps / 720p.
Works identically over wifi or cellular.

### University wifi restrictions — what actually needs what

Everything control-plane already assumes a hostile network and needs only
**ordinary outbound HTTPS (port 443)** — the same thing a web browser uses,
which university wifi always allows:

- relay agent → Supabase (HTTPS + WSS on 443)
- overlay browser sources → Vercel + Supabase (443)
- control panel on your phone → works from cellular anyway

Two things DO deserve a real in-venue test:

1. **Stream egress.** If the network blocks outbound port 1935, plain RTMP to
   the platform fails. Use **RTMPS on 443** instead: in OBS's stream settings
   pick YouTube's RTMPS ingest (`rtmps://a.rtmps.youtube.com:443/live2`) —
   indistinguishable from HTTPS to the network.
2. **Tailscale's path between rooms.** With client isolation on, direct
   peer-to-peer may be impossible, and Tailscale silently falls back to its
   DERP relays — the room feeds then travel out to the internet and back,
   costing upload *and* download bandwidth on the venue connection and adding
   latency. Check with `tailscale ping mac-mini-room2`: "via DERP" in the
   output means relayed. If feeds ride DERP, drop bitrates (2000 Kbps or
   less per feed) and re-test — or bring a cheap travel router as a private
   production LAN for the four machines (camera feeds then never touch the
   university network at all; the main PC alone needs the internet uplink).

## 3. Scenes

Create one scene per ring, named **exactly** `Ring 1` … `Ring 6` (the control
panel targets scenes by these names — see `ringSceneName` in `src/lib/obs.ts`),
and put each ring's camera source in its scene.

Then create the "screen" scenes — full-frame boards to cut to between
matches, one browser source each (URLs in §4): `Sumobots` (title card),
`Intermission`, `Bracket`, `Standings`, `Leaderboard`, plus the local-image
`Standby` (see §6b). The panel has a button for each; any you don't create
simply fail the switch (logged by the relay) and can be ignored.

## 4. Browser sources (the overlays)

All overlays have transparent backgrounds and update live over Supabase
Realtime — add them once and never touch them again. Replace `BASE` with the
deployed site, e.g. `https://pickabots.ramsocunsw.org`.

| Overlay | URL | Add to | Size | Position |
|---|---|---|---|---|
| Now Battling lower-third (with live betting odds) | `BASE/overlay/now-battling?ring=N` (add `&division=open` for open-division rings) | each `Ring N` scene | 1920×1080 | full canvas |
| Up-next list | `BASE/overlay/upcoming?count=5` | `Intermission` (or any) | 1920×1080 | full canvas (renders top-right) |
| Bracket | `BASE/overlay/bracket` / `?division=open` | `Bracket` | 1920×1080 | full canvas |
| Team standings / day stats | `BASE/overlay/stats?top=8` | `Standings` | 1920×1080 | full canvas (renders centered) |
| Player leaderboard (RAM coins) | `BASE/overlay/leaderboard?top=10` | `Leaderboard` | 1920×1080 | full canvas (renders centered) |
| Title card (logo + SUMOBOTS 2026) | `BASE/overlay/title` (`?year=` to change) | `Sumobots` | 1920×1080 | full canvas (paints its own background) |
| KPI side banner (played / remaining / est. finish / coins wagered / bettors) | `BASE/overlay/kpi` (`?side=left`) | any camera scene | 1920×1080 | full canvas (renders mid-right edge) |

The lower-third's odds strip appears automatically while its match has a live
voting row — pool split, percentages, and payout multipliers move in realtime
as bets land (throttled to one update per ~1.5s).

Browser-source settings: leave **Custom CSS** as the default
(`body { background-color: rgba(0,0,0,0); }`), and tick
**Shutdown source when not visible** OFF so the pages keep their realtime
subscriptions warm across scene cuts.

The lower-third renders *nothing* when its ring is idle, so it can stay in the
scene permanently.

### Which division is a ring?

Ring numbers in overlay URLs are per **division schedule** (the admin page's
Ring 1…N for Standard, and Ring 1…N for Open). If, say, physical rings 1–3 run
Standard and 4–6 run Open, the browser sources are:

- Scene `Ring 4` → `BASE/overlay/now-battling?ring=1&division=open`
- Scene `Ring 5` → `BASE/overlay/now-battling?ring=2&division=open`, etc.

## 5. The control panel

`BASE/control` on any phone/laptop — sign in with a Clerk account that has the
admin role (or enter the admin access code, same as `/admin`). It offers:

- one-tap scene switching (Ring 1–6 + Intermission)
- Go Live / Stop Stream, Record, Replay Buffer (stops need a confirming second tap)
- the **Now Battling override** — replaces the bracket-derived lower-third
  text on one ring (or all rings) until cleared
- connection lights: **Relay** (agent heartbeating?) and **OBS** (agent can
  reach OBS?)

Buttons queue commands; the highlight only moves once OBS confirms — over
venue/cellular latency, trust the highlight, not the tap.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| Relay light red | Relay window running on the OBS PC? `.env` filled in? |
| Relay green, OBS amber | OBS open? WebSocket server enabled? Password matches `.env`? |
| Buttons do nothing but lights green | Scene names must match `Ring N` exactly (case-sensitive). Check the relay window's log — failed commands print there and are stored on the row in `pickabots_obs_commands`. |
| Lower-third empty | That ring has no ready match (both team names known) in the division schedule — check `/matches`, or use the panel's override. |
| Overlay not updating | `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be set on the deployment (falls back to 30s polling without it). |
| Feed light red for a room | That room's encoder isn't reaching MediaMTX: check the room machine's Tailscale is up (`tailscale status`), OBS/Larix is actually streaming, and the push URL uses the main PC's MagicDNS name. |
| No feed lights at all | `MEDIAMTX_API_URL` unset in the relay `.env`, or MediaMTX isn't running / its `api: yes` is missing. |

## 6b. Backups — the failure playbook

Set these up before the event; each is the fallback for one failure mode.

| If this dies | Backup | Prep needed |
|---|---|---|
| Anything on camera (feed drop, ring chaos) | Cut to the **Standby** scene — a local image + "back shortly" text, no internet involved | Create the scene in OBS from a bundled image; the panel has a button for it |
| The livestream itself | The **local recording** is the master copy — start it alongside the stream and leave it running all day (recordings survive stream drops and can be re-uploaded) | One tap on the panel; verify disk space for ~8h at your record bitrate |
| Venue internet uplink | Phone hotspot to the main PC; OBS auto-reconnects the stream, relay + overlays reconnect on their own | Data plan with headroom; test tethering to the PC beforehand |
| Port 1935 blocked for egress | Stream via **RTMPS on 443** (`rtmps://a.rtmps.youtube.com:443/live2`) | Set it as the OBS ingest from the start — no reason to wait for failure |
| A remote room feed (feed light red) | Cut that ring's scene to Standby or another ring; restart the room's OBS/Larix push | Nothing — feed lights tell you within ~10s |
| Room-to-room Tailscale (DERP overloaded) | Travel router as private production LAN | Pack one + short ethernet runs |
| The relay agent / control panel | Drive OBS directly at the desk — scene switching in OBS works with everything else down; the relay auto-reconnects and marks its backlog stale rather than replaying it | Someone stays within reach of the main PC |
| Vercel / Supabase outage | Overlays go transparent (cameras stay clean, nothing ugly on stream); run the bracket verbally / on the Standby screen until it returns | Nothing |
| OBS itself crashes | Reopen it — the relay reconnects within seconds, scene collection persists; the recording resumes with a new file | Enable "Automatically record when streaming" as a belt-and-braces |

## 7. Pre-event test checklist

- [ ] All 4 devices ping each other's Tailscale IPs **on university wifi** — validates the whole ingest approach; do this first. Note whether `tailscale ping` says direct or "via DERP" (see §2b) — DERP works but changes the bitrate budget.
- [ ] Outbound RTMP from the venue: if port 1935 is blocked, switch OBS to the platform's RTMPS/443 ingest.
- [ ] Mac Mini + laptop push to MediaMTX for 10+ min at real inter-room distance; watch for dropped frames and check the panel's feed lights track them.
- [ ] Real upload speed test from each room's actual spot; set RTMP bitrates comfortably below the measured ceiling.
- [ ] Relay agent end-to-end from a phone on cellular: scene switch lands, stream stats appear, feed lights correct.
- [ ] Kill a room feed mid-test and confirm the panel flags it within ~10s.
