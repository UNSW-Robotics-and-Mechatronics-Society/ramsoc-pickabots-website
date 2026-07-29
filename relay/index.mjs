/**
 * Pickabots OBS relay agent — runs ON the OBS streaming PC.
 *
 * obs-websocket only listens locally, so the hosted control panel can't reach
 * it. This process is the bridge: it keeps an OUTBOUND Supabase Realtime
 * subscription open (works behind any venue NAT — no port forwarding, no
 * tunnel), executes each queued command against OBS on localhost, and
 * heartbeats OBS's real state back to `pickabots_obs_state` so the panel and
 * overlays show the truth rather than what was last requested.
 *
 * Delivery is belt-and-braces: Realtime INSERT events for instant reaction,
 * plus a 5s poll of pending rows in case the socket silently dropped. Each
 * command is CLAIMED with a conditional update (pending → done/failed only if
 * still pending) so the two paths can never double-fire a command.
 *
 * Run:  node index.mjs   (see relay/README.md / docs/OBS.md for setup)
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import OBSWebSocket from "obs-websocket-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Either OBS_WS_URL directly, or OBS_WS_HOST (+ optional OBS_WS_PORT) per the
// networking spec — both resolve to the same ws:// URL. Default: local OBS.
const OBS_URL = process.env.OBS_WS_URL
  || (process.env.OBS_WS_HOST ? `ws://${process.env.OBS_WS_HOST}:${process.env.OBS_WS_PORT || 4455}` : "ws://127.0.0.1:4455");
const OBS_PASSWORD = process.env.OBS_WS_PASSWORD || "";
// MediaMTX control API (mediamtx.yml: api: yes). When set, each heartbeat
// also reports which remote-room RTMP feeds (room2/room3/phone) are actually
// publishing, so the panel can verify the inter-room links — leave empty to
// disable if MediaMTX isn't part of the setup.
const MEDIAMTX_API = process.env.MEDIAMTX_API_URL || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — copy .env.example to .env and fill it in.");
  process.exit(1);
}

const HEARTBEAT_MS = 10_000;      // must stay < RELAY_FRESH_MS (25s) in the web app
const POLL_MS = 5_000;            // realtime-miss safety net
const STARTUP_GRACE_MS = 15_000;  // pending rows older than this on boot are stale

const log = (...args) => console.log(new Date().toISOString(), ...args);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── OBS connection (auto-reconnect) ─────────────────────────────────

const obs = new OBSWebSocket();
let obsConnected = false;

// Exactly ONE reconnect may ever be scheduled. Both the connect-failure path
// and the ConnectionClosed event used to schedule their own retry — and a
// failed connect fires ConnectionClosed too, so each failure spawned TWO new
// attempts: a geometric storm that eventually drowned the event loop (seen
// live: relay heartbeating but not processing, then fully wedged).
let reconnectTimer = null;
function scheduleReconnect(delayMs) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void connectObs(); }, delayMs);
}

async function connectObs() {
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD || undefined);
    obsConnected = true;
    log(`Connected to OBS at ${OBS_URL}`);
    await pushState();
  } catch (err) {
    obsConnected = false;
    log(`OBS connect failed (${err.message ?? err}) — retrying in 5s. Is OBS open with the WebSocket server enabled?`);
    scheduleReconnect(5000);
  }
}

obs.on("ConnectionClosed", () => {
  if (obsConnected) log("OBS connection closed — reconnecting…");
  obsConnected = false;
  scheduleReconnect(3000);
});

// An 'error' event with no listener KILLS a Node process — and obs-websocket-js
// emits one when OBS goes away abruptly (crash, force-close). Observed in the
// field: OBS closed at end of day → relay died instead of riding its own
// reconnect loop. Log and let ConnectionClosed drive the reconnect.
obs.on("ConnectionError", (err) => {
  log("OBS connection error:", err?.message ?? err);
});

// Last-resort safety nets: during a live event the relay must degrade (log,
// keep heartbeating, keep reconnecting), never exit. Anything reaching here
// is a bug to fix later — but not at the cost of losing stream control now.
process.on("uncaughtException", (err) => log("UNCAUGHT (surviving):", err?.stack ?? err));
process.on("unhandledRejection", (err) => log("UNHANDLED REJECTION (surviving):", err?.stack ?? err));

// Live state pushes on OBS's own events, so a scene switched at the OBS PC
// itself (not via the panel) still updates the panel/overlays immediately.
obs.on("CurrentProgramSceneChanged", () => void pushState());
obs.on("StreamStateChanged", () => void pushState());
obs.on("RecordStateChanged", () => void pushState());
obs.on("ReplayBufferStateChanged", () => void pushState());

// ── State heartbeat ─────────────────────────────────────────────────

// Byte counter from the previous heartbeat, for measuring the real outbound
// bitrate: "streaming: true" only says the output is switched on; a bytes
// delta proves data is actually leaving the encoder (a stalled or
// disconnected RTMP session shows ~0 kbps while the flag stays true).
let prevBytes = null;
let prevBytesAt = 0;

async function readObsState() {
  if (!obsConnected) return { scene: "", streaming: false, recording: false, replay: false, stats: {} };
  const scene = await obs.call("GetCurrentProgramScene").then(r => r.currentProgramSceneName).catch(() => "");
  const stream = await obs.call("GetStreamStatus").catch(() => null);
  const recording = await obs.call("GetRecordStatus").then(r => r.outputActive).catch(() => false);
  // Errors when no replay buffer is configured in OBS — treat as off.
  const replay = await obs.call("GetReplayBufferStatus").then(r => r.outputActive).catch(() => false);

  const streaming = stream?.outputActive ?? false;
  let stats = {};
  if (streaming) {
    const now = Date.now();
    let kbps;
    if (prevBytes !== null && now > prevBytesAt) {
      kbps = Math.max(0, Math.round(((stream.outputBytes - prevBytes) * 8) / (now - prevBytesAt)));
    }
    prevBytes = stream.outputBytes;
    prevBytesAt = now;
    stats = {
      timecode: (stream.outputTimecode ?? "").split(".")[0],
      ...(kbps !== undefined ? { kbps } : {}),
      droppedPct: stream.outputTotalFrames > 0
        ? Math.round((stream.outputSkippedFrames / stream.outputTotalFrames) * 1000) / 10
        : 0,
      congestion: Math.round((stream.outputCongestion ?? 0) * 100) / 100,
    };
  } else {
    prevBytes = null;
  }
  return { scene, streaming, recording, replay, stats };
}

// Which MediaMTX ingest paths currently have a live publisher. A configured
// path with no publisher reports ready:false — exactly the "Room 2 stopped
// pushing" signal the stream desk needs. Returns {} when the API is off or
// unreachable (indistinguishable from "no feeds configured" on the panel,
// which is the right degradation: no false alarms, just no feed lights).
async function readFeeds() {
  if (!MEDIAMTX_API) return {};
  try {
    const res = await fetch(`${MEDIAMTX_API}/v3/paths/list`);
    if (!res.ok) return {};
    const data = await res.json();
    const feeds = {};
    for (const p of data.items ?? []) feeds[p.name] = !!p.ready;
    return feeds;
  } catch {
    return {};
  }
}

async function pushState() {
  const [s, feeds] = await Promise.all([readObsState(), readFeeds()]);
  const { error } = await supabase
    .from("pickabots_obs_state")
    .update({
      current_scene: s.scene,
      streaming: s.streaming,
      recording: s.recording,
      replay_buffer: s.replay,
      stream_stats: s.stats,
      feed_status: feeds,
      obs_connected: obsConnected,
      relay_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) log("State push failed:", error.message);
}

// ── Command execution ───────────────────────────────────────────────

async function execute(action, payload) {
  switch (action) {
    case "set_scene":
      return obs.call("SetCurrentProgramScene", { sceneName: String(payload?.scene ?? "") });
    case "start_stream": return obs.call("StartStream");
    case "stop_stream": return obs.call("StopStream");
    case "start_record": return obs.call("StartRecord");
    case "stop_record": return obs.call("StopRecord");
    case "start_replay_buffer": return obs.call("StartReplayBuffer");
    case "save_replay_buffer": return obs.call("SaveReplayBuffer");
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function processCommand(cmd) {
  // Claim: only proceed if WE flip it out of pending. The realtime handler
  // and the poll can both see the same row; exactly one claim succeeds.
  const { data: claimed, error: claimErr } = await supabase
    .from("pickabots_obs_commands")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("id", cmd.id)
    .eq("status", "pending")
    .select("id");
  if (claimErr || !claimed || claimed.length === 0) return;

  if (!obsConnected) {
    await commandFailed(cmd, "OBS not connected");
    return;
  }

  try {
    await execute(cmd.action, cmd.payload);
    log(`✓ ${cmd.action}`, cmd.payload && Object.keys(cmd.payload).length ? JSON.stringify(cmd.payload) : "");
    await pushState();
  } catch (err) {
    await commandFailed(cmd, err?.message ?? String(err));
  }
}

// Record the failure on the command row AND surface it on the state row —
// the panel's buttons are fire-and-forget, so without the state-row copy a
// failed switch (typo'd scene name, OBS closed) is only visible in this
// console at the venue desk, not on the operator's phone.
async function commandFailed(cmd, message) {
  log(`✗ ${cmd.action} failed:`, message);
  await supabase.from("pickabots_obs_commands")
    .update({ status: "failed", error: message })
    .eq("id", cmd.id);
  await supabase.from("pickabots_obs_state")
    .update({
      last_error: `${cmd.action}: ${message}`,
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

async function drainPending() {
  const { data, error } = await supabase
    .from("pickabots_obs_commands")
    .select("id, action, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) { log("Poll failed:", error.message); return; }
  for (const cmd of data ?? []) await processCommand(cmd);
}

// A backlog queued while the relay was down must not replay as a burst of
// scene flips when it returns — mark anything older than the grace window
// stale instead of executing it.
async function expireStale() {
  const cutoff = new Date(Date.now() - STARTUP_GRACE_MS).toISOString();
  const { data } = await supabase
    .from("pickabots_obs_commands")
    .update({ status: "stale" })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  if (data && data.length > 0) log(`Expired ${data.length} stale queued command(s) from before startup.`);
}

// ── Wire-up ─────────────────────────────────────────────────────────

async function main() {
  log("Pickabots OBS relay starting…");
  await connectObs();
  await expireStale();
  await drainPending();

  supabase
    .channel("obs-commands")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "pickabots_obs_commands" },
      (msg) => void processCommand(msg.new),
    )
    .subscribe((status) => log(`Realtime subscription: ${status}`));

  setInterval(() => void pushState(), HEARTBEAT_MS);
  setInterval(() => void drainPending(), POLL_MS);
  log("Relay running. Leave this window open for the duration of the stream.");
}

main().catch((err) => { console.error(err); process.exit(1); });
