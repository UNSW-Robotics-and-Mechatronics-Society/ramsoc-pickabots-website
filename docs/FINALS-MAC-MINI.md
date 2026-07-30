# Sumobots Finals — Mac Mini as the OBS Machine (AI-agent setup guide)

This doc is self-contained: hand it to the AI agent on the Mac Mini and it has
everything needed to configure the machine as the **main streaming PC** for
the Sumobots finals — OBS, scenes, overlays, and the relay agent that lets us
drive OBS from the phone control panel at
**https://pickabots.ramsocunsw.org/control**.

## How control works (read this first)

```
Phone /control ─► Vercel API ─► Supabase table `pickabots_obs_commands`
                                        │  Supabase Realtime (outbound WSS)
Mac Mini:  relay agent  ◄───────────────┘
              │  ws://127.0.0.1:4455  (obs-websocket, localhost only)
              ▼
             OBS ──composites──► /overlay/* browser sources (Supabase Realtime)
```

**There are NO inbound webhooks and nothing to expose.** The relay agent makes
only *outbound* HTTPS/WSS connections (port 443) to Supabase — obs-websocket
stays bound to localhost. No port forwarding, no tunnels for control. This
works on any network that allows ordinary web browsing.

⚠️ **Only ONE relay agent may run at a time across all machines.** The old
main OBS PC (`main-obs-pc`) has a Task Scheduler job called *"Pickabots
Relay"* that auto-starts at logon — Dash must disable/stop it before the
Mini's relay goes live, or the two will fight over the command queue and the
panel's state will flap.

## 1. Install (one-time)

1. **OBS Studio 30+** — https://obsproject.com (websocket server is built in)
2. **Node.js 18+** — `brew install node` or https://nodejs.org
3. **Tailscale** — already installed and on the `ramsocunsw` tailnet
   (MagicDNS suffix `tail9fda47.ts.net`). Confirm the menu-bar icon says
   **Connected**. Only needed if remote camera feeds push to this machine
   (§6) — control and overlays don't use it.
4. **Clone the repo:**
   ```bash
   git clone https://github.com/UNSW-Robotics-and-Mechatronics-Society/ramsoc-pickabots-website.git
   cd ramsoc-pickabots-website
   ```

## 2. Enable obs-websocket

OBS → **Tools → WebSocket Server Settings** → tick *Enable WebSocket server*
(port **4455**) → *Show Connect Info* → copy the **password**.

## 3. Relay agent — the thing that lets the app control OBS

```bash
cd relay
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://ouoxxaiuraqqvyrwznwc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Dash sends this separately** (never commit it) |
| `OBS_WS_URL` | `ws://127.0.0.1:4455` (default, leave as is) |
| `OBS_WS_PASSWORD` | the password from step 2 |
| `MEDIAMTX_API_URL` | `http://127.0.0.1:9997` **only if** MediaMTX runs here (§6); otherwise leave empty |

Then, with OBS open:

```bash
npm start
```

Leave it running for the whole event (a Terminal window is fine, or add it as
a Login Item). It reconnects to both OBS and Supabase by itself. Within ~10 s
the **Relay** and **OBS** lights on `/control` turn green.

## 4. Build the scene collection (scripted)

With OBS open and the relay `.env` filled in:

```bash
cd relay
node obs-setup.mjs
```

Idempotent — safe to re-run. It creates all **17 scenes** the control panel
targets, with every overlay browser source wired:

- `Ring 1` … `Ring 6` — one per physical ring, each with its
  `now-battling` lower-third overlay (rings 4–6 use the **open division**
  URLs, i.e. open rings 1–3; flip URLs in OBS if the floor plan differs)
- `Sumobots` (title card), `Intermission`, `Bracket`, `Standings`,
  `Leaderboard`, `Results`, `Vote` — full-frame info boards
- `All Rings` — 2×2 multiview; the info board is auto-placed bottom-right,
  the three camera quadrants are added by hand (step 5)
- `Commentary` — phone feed + KPI banner
- `Standby` — local text/image, works with zero internet (the panic button)
- `Blank` — empty, pure black

**Scene names must never be edited** — the panel targets them by exact name.

Overlays update live via Supabase Realtime; add once, never touch. If a
browser source ever shows the wrong page, *rewrite its URL with `?v=2`
appended* — OBS's "refresh" button reloads the wrong page.

## 5. Manual OBS bits (can't be scripted)

1. **Cameras**: plug in the UGREEN capture cards (they appear as webcams,
   no drivers). In each `Ring N` scene in use: Sources → **+ → Video Capture
   Device** → pick the card → drag it **below** the overlay source.
   For `All Rings`: add existing camera sources, right-click → Transform →
   Edit Transform → Bounding Box **Scale to inner bounds**, Size **960×540**,
   Positions **0,0 / 960,0 / 0,540** (board overlay already occupies 960,540).
2. **Settings → Output** (Output Mode: **Advanced**):
   - *Streaming*: encoder **Apple VT H264 hardware**, bitrate **6000 Kbps**,
     keyframe interval **2 s**
   - *Recording*: format **mkv**, path on a drive with **100 GB+ free**
   - *Replay Buffer*: **Enable, 30 seconds** (panel's replay button needs it)
3. **Settings → General**: tick *Automatically record when streaming*.
4. **Settings → Stream**: Service **YouTube - RTMPS**, server
   `rtmps://a.rtmps.youtube.com:443/live2` (RTMPS on 443 — passes uni wifi),
   **stream key from Dash / YouTube Studio → Go Live**.
5. **Settings → Video**: base + output **1920×1080**, **30 fps**.
6. **Mic**: commentator USB mic → Settings → Audio → Mic/Auxiliary Device 1;
   levels peak yellow ≈ −15 dB. Audio is global across scenes.

## 6. Remote camera feeds (only if other rooms push to this machine)

If a second room pushes a camera feed, this machine also runs **MediaMTX**:

1. Download the macOS binary from https://github.com/bluenviron/mediamtx/releases
2. Use `relay/mediamtx.yml` from the repo as its config (defines paths
   `room2` / `room3` / `phone` and enables the API for the panel's feed lights)
3. Run `./mediamtx mediamtx.yml`, and set `MEDIAMTX_API_URL=http://127.0.0.1:9997`
   in the relay `.env`
4. Remote machines (on the tailnet) push to
   `rtmp://<this-mini's-tailnet-name>.tail9fda47.ts.net:1935/room2` etc.,
   stream key blank, 2000–3000 Kbps, keyframe 2 s
5. The feeds land in OBS via the `feed-room2/3/phone` media sources the setup
   script already created (they read `rtmp://localhost:1935/…`)

Skip all of this if every camera is plugged directly into the Mini.

## 7. What the control panel gives us

`https://pickabots.ramsocunsw.org/control` on any phone — sign in with an
admin Clerk account or the admin access code. One-tap scene switching (all 17
scenes), Go Live / Stop, Record, Save Instant Replay, a "Now Battling"
lower-third override, plus Relay/OBS/feed health lights. Buttons queue
commands; the highlight moves only once OBS confirms — trust the highlight.

## 8. Verify end-to-end (10 min, do this today)

1. Relay running, OBS open → `/control` shows **Relay ● OBS ●** green
2. Tap scenes from a phone **on cellular** — OBS follows within ~2 s
3. In `/admin` set a match active on ring 1 → lower-third fades in on `Ring 1`
4. Go Live to an **Unlisted** YouTube stream for 5 min → panel shows
   `● LIVE · timecode · ~6000 kbps · 0% dropped`; recording file appears
5. Tap **Save Instant Replay** → file lands in the recording folder
6. Kill the relay Terminal → panel warns → restart it → green again

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Relay light red | Relay not running, or `.env` missing values |
| Relay green, OBS amber | OBS closed, websocket disabled, or password mismatch |
| Buttons do nothing, lights green | Another relay still running elsewhere (see the ⚠️ above), or a scene was renamed |
| Overlay empty | That ring has no ready match — check `/matches` or use the panel override |
| Browser source shows wrong page | Rewrite the source URL with `?v=N` appended (don't trust "refresh") |
| Stream won't connect | Use the RTMPS/443 server string above, re-paste the stream key |
| Feed light red for a room | Room encoder → Tailscale → MediaMTX chain: `tailscale status`, then `curl http://127.0.0.1:9997/v3/paths/list` |
| Anything on camera goes wrong | Cut to **Standby** — works with zero internet |

**Secrets needed from Dash (sent separately, never committed):**
`SUPABASE_SERVICE_ROLE_KEY` and the **YouTube stream key**. Everything else
is generated locally or already in this doc.
